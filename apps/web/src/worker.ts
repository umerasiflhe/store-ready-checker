import {
  analyzeAndroidBundle,
  analyzeIosBundles,
  BlobByteSource,
  buildReport,
  evaluateAndroidRules,
  evaluateIosRules,
  inferFormFactor,
  parseListedSdksSeed,
  parseRequiredReasonSeed,
  parseRulesFile,
  primaryModule,
  ZipArchive,
  type AndroidFacts,
  type FormFactor,
  type IosFacts,
} from '@store-ready/core';
import webPkg from '../package.json' with { type: 'json' };
import listedSdksJson from '../../../rules/apple-listed-sdks.json' with { type: 'json' };
import requiredReasonApisJson from '../../../rules/apple-required-reason-apis.json' with { type: 'json' };
import rulesJson from '../../../rules/rules.json' with { type: 'json' };
import { detectKind } from './detectKind.ts';
import type { AnalyzeRequest, ErrorCategory, WorkerRequest, WorkerResponse } from './protocol.ts';

const rulesFileResult = parseRulesFile(rulesJson);
if (!rulesFileResult.ok) {
  throw new Error('rules/rules.json failed to parse in the worker: this should never happen');
}
const rulesFile = rulesFileResult.value;

const listedSdksResult = parseListedSdksSeed(listedSdksJson);
if (!listedSdksResult.ok) {
  throw new Error('rules/apple-listed-sdks.json failed to parse in the worker');
}
const listedSdks = listedSdksResult.value;

const requiredReasonApisResult = parseRequiredReasonSeed(requiredReasonApisJson);
if (!requiredReasonApisResult.ok) {
  throw new Error('rules/apple-required-reason-apis.json failed to parse in the worker');
}
const requiredReasonApis = requiredReasonApisResult.value;

const TOOL = { name: 'store-ready', version: webPkg.version, rulesVersion: rulesFile.rulesVersion };

type Session =
  | {
      readonly platform: 'ios';
      readonly facts: IosFacts;
      readonly fileName: string;
      readonly sizeBytes: number;
    }
  | {
      readonly platform: 'android';
      readonly facts: AndroidFacts;
      readonly fileName: string;
      readonly sizeBytes: number;
    };

let session: Session | undefined;

function post(message: WorkerResponse): void {
  postMessage(message);
}

function postError(category: ErrorCategory, message: string): void {
  post({ type: 'error', category, message });
}

function evaluateAndBuildReport(asOf: string, formFactorOverride: FormFactor | undefined): void {
  if (!session) {
    postError('no-session', 'No build has been analyzed yet.');
    return;
  }
  post({ type: 'progress', stage: 'evaluating' });

  if (session.platform === 'ios') {
    const findings = evaluateIosRules(session.facts, rulesFile, asOf, {
      listedSdks,
      requiredReasonApis,
    });
    const mainApp = session.facts.bundles.find((bundle) => bundle.kind === 'app');
    const report = buildReport({
      tool: TOOL,
      asOf,
      input: { fileName: session.fileName, sizeBytes: session.sizeBytes, kind: 'ipa' },
      app: {
        platform: 'ios',
        id: mainApp?.info.bundleIdentifier ?? '',
        version: mainApp?.info.shortVersionString ?? '',
        build: mainApp?.info.bundleVersion ?? '',
      },
      findings,
    });
    post({ type: 'report', report, androidFormFactor: undefined });
    return;
  }

  const findings = evaluateAndroidRules(
    session.facts,
    rulesFile,
    asOf,
    formFactorOverride ? { formFactorOverride } : undefined,
  );
  const manifest = primaryModule(session.facts)?.manifest;
  const report = buildReport({
    tool: TOOL,
    asOf,
    input: { fileName: session.fileName, sizeBytes: session.sizeBytes, kind: session.facts.kind },
    app: {
      platform: 'android',
      id: manifest?.packageName ?? '',
      version: manifest?.versionName ?? '',
      build: manifest?.versionCode !== undefined ? String(manifest.versionCode) : '',
    },
    findings,
  });
  const androidFormFactor = formFactorOverride ?? inferFormFactor(manifest?.usesFeatures ?? []);
  post({ type: 'report', report, androidFormFactor });
}

async function analyze(request: AnalyzeRequest): Promise<void> {
  session = undefined;
  post({ type: 'progress', stage: 'opening' });

  const opened = await ZipArchive.open(new BlobByteSource(request.file));
  if (!opened.ok) {
    const category: ErrorCategory = opened.error.code === 'EMPTY_FILE' ? 'corrupted' : 'not-a-zip';
    postError(category, opened.error.message);
    return;
  }
  const archive = opened.value;

  try {
    const kind = detectKind(request.fileName, archive.list());
    if (!kind) {
      postError('unsupported', "This doesn't look like an .ipa, .aab, or .apk.");
      return;
    }

    post({ type: 'progress', stage: 'analyzing' });

    if (kind === 'ipa') {
      const factsResult = await analyzeIosBundles(archive, requiredReasonApis);
      if (!factsResult.ok) {
        postError('corrupted', factsResult.error.message);
        return;
      }
      session = {
        platform: 'ios',
        facts: factsResult.value,
        fileName: request.fileName,
        sizeBytes: request.file.size,
      };
    } else {
      const factsResult = await analyzeAndroidBundle(
        archive,
        new BlobByteSource(request.file),
        kind,
      );
      if (!factsResult.ok) {
        postError('corrupted', factsResult.error.message);
        return;
      }
      session = {
        platform: 'android',
        facts: factsResult.value,
        fileName: request.fileName,
        sizeBytes: request.file.size,
      };
    }
  } finally {
    await archive.close();
  }

  evaluateAndBuildReport(request.asOf, request.formFactorOverride);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'analyze') {
    void analyze(request);
    return;
  }
  evaluateAndBuildReport(request.asOf, request.formFactorOverride);
});
