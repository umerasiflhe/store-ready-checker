import { analyzeIosBundles } from './ios/analyze.ts';
import type { ListedSdksSeed } from './ios/listedSdks.ts';
import type { RequiredReasonSeed } from './ios/requiredReason.ts';
import { buildReport } from './report/build.ts';
import type { Report } from './report/types.ts';
import { evaluateIosRules } from './rules/engine.ts';
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
