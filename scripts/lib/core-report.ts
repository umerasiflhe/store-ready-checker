// Shared by scripts/conformance.ts and scripts/check-real-build.ts: run the TS core and the Swift
// CLI on the same file and compare their reports.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_VERSION } from '../../fixtures/helpers/toolVersion.ts';
import {
  loadListedSdks,
  loadRequiredReasonApis,
  loadRulesData,
} from '../../fixtures/helpers/loadFixture.ts';
import { analyzeAab, analyzeApk, analyzeIpa } from '../../packages/core/src/index.ts';
import {
  parseListedSdksSeed,
  type ListedSdksSeed,
} from '../../packages/core/src/ios/listedSdks.ts';
import {
  parseRequiredReasonSeed,
  type RequiredReasonSeed,
} from '../../packages/core/src/ios/requiredReason.ts';
import type { Report } from '../../packages/core/src/report/types.ts';
import { parseRulesFile, type RulesFile } from '../../packages/core/src/rules/types.ts';
import type { Result } from '../../packages/core/src/util/result.ts';
import { BlobByteSource } from '../../packages/core/src/zip/byteSource.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cliExecutable = join(repoRoot, 'cli', '.build', 'release', 'storeready');

export interface RuleData {
  readonly rulesFile: RulesFile;
  readonly listedSdks: ListedSdksSeed;
  readonly requiredReasonApis: RequiredReasonSeed;
}

export function loadRuleData(): RuleData {
  const rulesFile = parseRulesFile(loadRulesData());
  if (!rulesFile.ok) throw new Error('rules/rules.json is invalid');
  const listedSdks = parseListedSdksSeed(loadListedSdks());
  if (!listedSdks.ok) throw new Error('rules/apple-listed-sdks.json is invalid');
  const requiredReasonApis = parseRequiredReasonSeed(loadRequiredReasonApis());
  if (!requiredReasonApis.ok) throw new Error('rules/apple-required-reason-apis.json is invalid');
  return {
    rulesFile: rulesFile.value,
    listedSdks: listedSdks.value,
    requiredReasonApis: requiredReasonApis.value,
  };
}

/** Analyses `blob` with the TS core, picking the pipeline from `fileName`'s extension. */
export function analyzeWithCore(
  blob: Blob,
  fileName: string,
  asOf: string,
  data: RuleData,
): Promise<Result<Report>> {
  if (fileName.endsWith('.ipa')) {
    return analyzeIpa(new BlobByteSource(blob), {
      fileName,
      asOf,
      toolVersion: TOOL_VERSION,
      rules: data.rulesFile,
      requiredReasonApis: data.requiredReasonApis,
      listedSdks: data.listedSdks,
    });
  }
  const analyze = fileName.endsWith('.aab') ? analyzeAab : analyzeApk;
  return analyze(new BlobByteSource(blob), {
    fileName,
    asOf,
    toolVersion: TOOL_VERSION,
    rules: data.rulesFile,
  });
}

/** Clears the one field allowed to differ between the TS core and the Swift CLI. */
export function normalizeReport(report: Report): Report {
  return { ...report, tool: { ...report.tool, version: '' } };
}

export function buildSwiftCli(): void {
  const build = spawnSync(
    'swift',
    ['build', '--package-path', 'cli', '-c', 'release', '--product', 'storeready'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (build.status !== 0) {
    throw new Error('swift build --product storeready failed');
  }
  if (!existsSync(cliExecutable)) {
    throw new Error(`expected a built binary at ${cliExecutable}`);
  }
}

export function runSwiftCli(
  filePath: string,
  asOf: string,
  executable = cliExecutable,
): { status: number; stdout: string } {
  const run = spawnSync(executable, ['check', filePath, '--format', 'json', '--as-of', asOf], {
    encoding: 'utf8',
  });
  return { status: run.status ?? -1, stdout: run.stdout };
}
