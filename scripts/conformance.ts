import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Report } from '../packages/core/src/report/types.ts';
import { fixtureFilePath, readFixtureBlob } from '../fixtures/helpers/loadFixture.ts';
import {
  analyzeWithCore,
  buildSwiftCli,
  loadRuleData,
  normalizeReport,
  runSwiftCli,
} from './lib/core-report.ts';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliDir = join(repoRoot, 'cli');

interface FixtureCase {
  readonly fileName: string;
  readonly asOf: string;
  readonly goldenName: string;
}

function fixture(fileName: string, asOf = '2026-10-20', goldenName?: string): FixtureCase {
  return { fileName, asOf, goldenName: goldenName ?? fileName.replace(/\.(ipa|aab|apk)$/, '') };
}

// Same fixture/asOf/golden-name mapping as fixtures/ios.golden.test.ts,
// fixtures/android.golden.test.ts, and cli/Tests/storereadyTests/CheckIntegrationTests.swift —
// one set of fixtures, the same cases exercised from three independent directions.
const FIXTURES: readonly FixtureCase[] = [
  fixture('ios-not-a-zip.ipa'),
  fixture('ios-no-payload.ipa'),
  fixture('ios-passing-app.ipa'),
  fixture('ios-old-xcode.ipa'),
  fixture('ios-old-minos.ipa'),
  fixture('ios-priv-001-missing-manifest.ipa'),
  fixture('ios-priv-002-missing-category.ipa'),
  fixture('ios-priv-003-bad-reason-code.ipa'),
  fixture('ios-priv-003-malformed-manifest.ipa'),
  fixture('ios-priv-004-listed-sdk-no-manifest.ipa'),
  fixture('ios-priv-004-listed-sdk-with-manifest.ipa'),
  fixture('ios-appex-old-sdk.ipa'),
  fixture('ios-fat-binary.ipa'),
  fixture('ios-encrypted-binary.ipa'),
  fixture('ios-binary-plist.ipa'),
  fixture('android-aab-passing.aab'),
  fixture('android-aab-tsdk-low.aab'),
  fixture('android-aab-tsdk-wear.aab'),
  fixture('android-aab-tsdk-tv.aab'),
  fixture('android-aab-tsdk-preview.aab'),
  fixture('android-aab-missing-uses-sdk.aab'),
  fixture(
    'android-aab-16k-load-misaligned.aab',
    '2026-10-20',
    'android-aab-16k-load-misaligned-warning',
  ),
  fixture(
    'android-aab-16k-load-misaligned.aab',
    '2027-02-01',
    'android-aab-16k-load-misaligned-error',
  ),
  fixture(
    'android-aab-16k-tv-misaligned.aab',
    '2026-07-31',
    'android-aab-16k-tv-misaligned-warning',
  ),
  fixture('android-aab-16k-tv-misaligned.aab', '2026-08-01', 'android-aab-16k-tv-misaligned-error'),
  fixture(
    'android-aab-16k-wear-misaligned.aab',
    '2026-09-14',
    'android-aab-16k-wear-misaligned-warning',
  ),
  fixture(
    'android-aab-16k-wear-misaligned.aab',
    '2026-09-15',
    'android-aab-16k-wear-misaligned-error',
  ),
  fixture('android-aab-16k-relro-misaligned.aab'),
  fixture('android-aab-16k-relro-exempt.aab'),
  fixture('android-aab-16k-bundleconfig-missing-flag.aab'),
  fixture('android-aab-64bit-missing.aab'),
  fixture('android-aab-malformed-manifest.aab'),
  fixture('android-apk-passing.apk'),
  fixture('android-apk-zip-misaligned.apk'),
  fixture('android-apk-zip-compressed-skipped.apk'),
  fixture('android-apk-not-a-zip.apk'),
  fixture('android-apk-no-manifest.apk'),
];

async function main(): Promise<void> {
  if (process.platform !== 'darwin' || !existsSync(join(cliDir, 'Package.swift'))) {
    console.log('Conformance skipped: Swift CLI not buildable here (need macOS and cli/).');
    return;
  }

  const ruleData = loadRuleData();

  console.log('Building storeready in release mode...');
  buildSwiftCli();

  const failures: string[] = [];

  for (const { fileName, asOf, goldenName } of FIXTURES) {
    const coreResult = await analyzeWithCore(readFixtureBlob(fileName), fileName, asOf, ruleData);
    const cli = runSwiftCli(fixtureFilePath(fileName), asOf);

    if (!coreResult.ok) {
      if (cli.status !== 2) {
        failures.push(
          `[${goldenName}] TS core failed (${coreResult.error.code}) but CLI exited ${String(cli.status)}, expected 2`,
        );
      }
      continue;
    }

    const expectedExitCode = coreResult.value.summary.status === 'blocked' ? 1 : 0;
    if (cli.status !== expectedExitCode) {
      failures.push(
        `[${goldenName}] expected CLI exit code ${String(expectedExitCode)}, got ${String(cli.status)}`,
      );
      continue;
    }

    let cliReport: Report;
    try {
      cliReport = JSON.parse(cli.stdout) as Report;
    } catch {
      failures.push(`[${goldenName}] CLI stdout was not valid JSON: ${cli.stdout}`);
      continue;
    }

    const coreNormalized = normalizeReport(coreResult.value);
    const cliNormalized = normalizeReport(cliReport);
    if (!isDeepStrictEqual(coreNormalized, cliNormalized)) {
      failures.push(
        `[${goldenName}] TS core and Swift CLI JSON output differ:\n` +
          `  TS:    ${JSON.stringify(coreNormalized)}\n` +
          `  Swift: ${JSON.stringify(cliNormalized)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`Conformance failed for ${String(failures.length)} fixture(s):\n`);
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Conformance passed: TS core and Swift CLI agree on all ${String(FIXTURES.length)} cases.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

export {};
