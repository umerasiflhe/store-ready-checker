// Runs the real TS core against every committed iOS/Android fixture and writes its output to
// fixtures/expected/<name>.json. Per the `make-fixture` skill: review the diff deliberately
// before committing — this script is meant to be run, read, and checked in, not trusted blindly.
import { analyzeAab, analyzeApk, analyzeIpa } from '../../packages/core/src/index.ts';
import { parseListedSdksSeed } from '../../packages/core/src/ios/listedSdks.ts';
import { parseRequiredReasonSeed } from '../../packages/core/src/ios/requiredReason.ts';
import { parseRulesFile } from '../../packages/core/src/rules/types.ts';
import { BlobByteSource } from '../../packages/core/src/zip/byteSource.ts';
import { TOOL_VERSION } from '../helpers/toolVersion.ts';
import {
  loadListedSdks,
  loadRequiredReasonApis,
  loadRulesData,
  readFixtureBlob,
  writeExpected,
} from '../helpers/loadFixture.ts';

const rulesFileResult = parseRulesFile(loadRulesData());
if (!rulesFileResult.ok) throw new Error('rules/rules.json is invalid');
const rulesFile = rulesFileResult.value;

const listedSdksResult = parseListedSdksSeed(loadListedSdks());
if (!listedSdksResult.ok) throw new Error('rules/apple-listed-sdks.json is invalid');
const listedSdks = listedSdksResult.value;

const requiredReasonApisResult = parseRequiredReasonSeed(loadRequiredReasonApis());
if (!requiredReasonApisResult.ok)
  throw new Error('rules/apple-required-reason-apis.json is invalid');
const requiredReasonApis = requiredReasonApisResult.value;

const IOS_FIXTURES = [
  'ios-not-a-zip.ipa',
  'ios-no-payload.ipa',
  'ios-passing-app.ipa',
  'ios-old-xcode.ipa',
  'ios-old-minos.ipa',
  'ios-priv-001-missing-manifest.ipa',
  'ios-priv-002-missing-category.ipa',
  'ios-priv-003-bad-reason-code.ipa',
  'ios-priv-003-malformed-manifest.ipa',
  'ios-priv-004-listed-sdk-no-manifest.ipa',
  'ios-priv-004-listed-sdk-with-manifest.ipa',
  'ios-appex-old-sdk.ipa',
  'ios-fat-binary.ipa',
  'ios-encrypted-binary.ipa',
  'ios-binary-plist.ipa',
];

interface AndroidFixtureCase {
  readonly fileName: string;
  readonly asOf: string;
  readonly goldenName: string;
}

const DEFAULT_AS_OF = '2026-10-20';

function androidFixture(
  fileName: string,
  asOf = DEFAULT_AS_OF,
  goldenName?: string,
): AndroidFixtureCase {
  return { fileName, asOf, goldenName: goldenName ?? fileName.replace(/\.(aab|apk)$/, '') };
}

const ANDROID_FIXTURES: readonly AndroidFixtureCase[] = [
  androidFixture('android-aab-passing.aab'),
  androidFixture('android-aab-tsdk-low.aab'),
  androidFixture('android-aab-tsdk-wear.aab'),
  androidFixture('android-aab-tsdk-tv.aab'),
  androidFixture('android-aab-tsdk-preview.aab'),
  androidFixture('android-aab-missing-uses-sdk.aab'),
  androidFixture(
    'android-aab-16k-load-misaligned.aab',
    '2026-10-20',
    'android-aab-16k-load-misaligned-warning',
  ),
  androidFixture(
    'android-aab-16k-load-misaligned.aab',
    '2027-02-01',
    'android-aab-16k-load-misaligned-error',
  ),
  androidFixture('android-aab-16k-relro-misaligned.aab'),
  androidFixture('android-aab-16k-relro-exempt.aab'),
  androidFixture('android-aab-16k-bundleconfig-missing-flag.aab'),
  androidFixture('android-aab-64bit-missing.aab'),
  androidFixture('android-aab-malformed-manifest.aab'),
  androidFixture('android-apk-passing.apk'),
  androidFixture('android-apk-zip-misaligned.apk'),
  androidFixture('android-apk-zip-compressed-skipped.apk'),
  androidFixture('android-apk-not-a-zip.apk'),
  androidFixture('android-apk-no-manifest.apk'),
];

async function main(): Promise<void> {
  for (const fileName of IOS_FIXTURES) {
    const blob = readFixtureBlob(fileName);
    const result = await analyzeIpa(new BlobByteSource(blob), {
      fileName,
      asOf: '2026-10-20',
      toolVersion: TOOL_VERSION,
      rules: rulesFile,
      requiredReasonApis,
      listedSdks,
    });
    const goldenName = fileName.replace(/\.ipa$/, '');
    await writeExpected(goldenName, result);
    console.log(`wrote fixtures/expected/${goldenName}.json`);
  }

  for (const { fileName, asOf, goldenName } of ANDROID_FIXTURES) {
    const blob = readFixtureBlob(fileName);
    const analyze = fileName.endsWith('.aab') ? analyzeAab : analyzeApk;
    const result = await analyze(new BlobByteSource(blob), {
      fileName,
      asOf,
      toolVersion: TOOL_VERSION,
      rules: rulesFile,
    });
    await writeExpected(goldenName, result);
    console.log(`wrote fixtures/expected/${goldenName}.json`);
  }
}

await main();
