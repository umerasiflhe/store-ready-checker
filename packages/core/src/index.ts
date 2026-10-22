import { analyzeAndroidBundle, primaryModule, type AndroidInputKind } from './android/analyze.ts';
import { analyzeIosBundles } from './ios/analyze.ts';
import type { ListedSdksSeed } from './ios/listedSdks.ts';
import type { RequiredReasonSeed } from './ios/requiredReason.ts';
import { buildReport } from './report/build.ts';
import type { Report } from './report/types.ts';
import { evaluateAndroidRules, evaluateIosRules } from './rules/engine.ts';
import type { RulesFile } from './rules/types.ts';
import type { Result } from './util/result.ts';
import type { ByteSource } from './zip/byteSource.ts';
import { ZipArchive } from './zip/centralDirectory.ts';

export interface AnalyzeIpaOptions {
  readonly fileName: string;
  /** "Check as of" date, `YYYY-MM-DD`. */
  readonly asOf: string;
  readonly toolVersion: string;
  readonly rules: RulesFile;
  readonly requiredReasonApis: RequiredReasonSeed;
  readonly listedSdks: ListedSdksSeed;
}

/**
 * Analyzes an `.ipa` and produces a report matching `schema/report.schema.json`. Rule data and
 * seed data are injected by the caller (worker, CLI, or tests) rather than read from disk here,
 * so this package stays free of filesystem/network access.
 */
export async function analyzeIpa(
  source: ByteSource,
  options: AnalyzeIpaOptions,
): Promise<Result<Report>> {
  const opened = await ZipArchive.open(source);
  if (!opened.ok) {
    return opened;
  }
  const archive = opened.value;
  try {
    const factsResult = await analyzeIosBundles(archive, options.requiredReasonApis);
    if (!factsResult.ok) {
      return factsResult;
    }
    const facts = factsResult.value;

    const findings = evaluateIosRules(facts, options.rules, options.asOf, {
      listedSdks: options.listedSdks,
      requiredReasonApis: options.requiredReasonApis,
    });

    const mainApp = facts.bundles.find((bundle) => bundle.kind === 'app');
    const report = buildReport({
      tool: {
        name: 'store-ready',
        version: options.toolVersion,
        rulesVersion: options.rules.rulesVersion,
      },
      asOf: options.asOf,
      input: { fileName: options.fileName, sizeBytes: source.size, kind: 'ipa' },
      app: {
        platform: 'ios',
        id: mainApp?.info.bundleIdentifier ?? '',
        version: mainApp?.info.shortVersionString ?? '',
        build: mainApp?.info.bundleVersion ?? '',
      },
      findings,
    });
    return { ok: true, value: report };
  } finally {
    await archive.close();
  }
}

export interface AnalyzeAndroidOptions {
  readonly fileName: string;
  /** "Check as of" date, `YYYY-MM-DD`. */
  readonly asOf: string;
  readonly toolVersion: string;
  readonly rules: RulesFile;
}

async function analyzeAndroid(
  source: ByteSource,
  kind: AndroidInputKind,
  options: AnalyzeAndroidOptions,
): Promise<Result<Report>> {
  const opened = await ZipArchive.open(source);
  if (!opened.ok) {
    return opened;
  }
  const archive = opened.value;
  try {
    const factsResult = await analyzeAndroidBundle(archive, source, kind);
    if (!factsResult.ok) {
      return factsResult;
    }
    const facts = factsResult.value;

    const findings = evaluateAndroidRules(facts, options.rules, options.asOf);

    const manifest = primaryModule(facts)?.manifest;
    const report = buildReport({
      tool: {
        name: 'store-ready',
        version: options.toolVersion,
        rulesVersion: options.rules.rulesVersion,
      },
      asOf: options.asOf,
      input: { fileName: options.fileName, sizeBytes: source.size, kind },
      app: {
        platform: 'android',
        id: manifest?.packageName ?? '',
        version: manifest?.versionName ?? '',
        build: manifest?.versionCode !== undefined ? String(manifest.versionCode) : '',
      },
      findings,
    });
    return { ok: true, value: report };
  } finally {
    await archive.close();
  }
}

/**
 * Analyzes an `.aab` and produces a report matching `schema/report.schema.json`. Rule data is
 * injected by the caller (worker, CLI, or tests) rather than read from disk here, so this
 * package stays free of filesystem/network access.
 */
export async function analyzeAab(
  source: ByteSource,
  options: AnalyzeAndroidOptions,
): Promise<Result<Report>> {
  return analyzeAndroid(source, 'aab', options);
}

/**
 * Analyzes an `.apk` and produces a report matching `schema/report.schema.json`. Rule data is
 * injected by the caller (worker, CLI, or tests) rather than read from disk here, so this
 * package stays free of filesystem/network access.
 */
export async function analyzeApk(
  source: ByteSource,
  options: AnalyzeAndroidOptions,
): Promise<Result<Report>> {
  return analyzeAndroid(source, 'apk', options);
}

export type { AndroidFacts, ModuleFacts, AndroidInputKind } from './android/analyze.ts';
export type { IosFacts, BundleFacts } from './ios/analyze.ts';
export type { ListedSdksSeed } from './ios/listedSdks.ts';
export { parseListedSdksSeed } from './ios/listedSdks.ts';
export type { RequiredReasonSeed } from './ios/requiredReason.ts';
export { parseRequiredReasonSeed } from './ios/requiredReason.ts';
export type { Finding, Severity, Confidence } from './rules/types.ts';
export { parseRulesFile } from './rules/types.ts';
export type { RulesFile } from './rules/types.ts';
export type {
  Report,
  ReportApp,
  ReportInput,
  ReportStatus,
  ReportSummary,
  ReportTool,
} from './report/types.ts';
export type { ByteSource } from './zip/byteSource.ts';
export { BlobByteSource } from './zip/byteSource.ts';
export type { ParseError, Result } from './util/result.ts';

// The split below lets a long-lived caller (the web worker) parse a build once and re-evaluate
// rules cheaply afterwards (e.g. on an "as of" date or form-factor change) without re-reading the
// archive. `analyzeIpa`/`analyzeAab`/`analyzeApk` above remain the simple one-shot entry points.
export { analyzeIosBundles } from './ios/analyze.ts';
export type { IosCheckSeeds } from './rules/checks/ios.ts';
export { analyzeAndroidBundle, primaryModule } from './android/analyze.ts';
export type { AndroidRuleCheckOptions } from './rules/checks/android.ts';
export { evaluateIosRules, evaluateAndroidRules } from './rules/engine.ts';
export { buildReport } from './report/build.ts';
export { ZipArchive } from './zip/centralDirectory.ts';
export type { FormFactor } from './android/formFactor.ts';
export { inferFormFactor } from './android/formFactor.ts';
export { reportToMarkdown } from './report/markdown.ts';
