// Golden tests (brief §7.2): core output for every committed Android fixture must equal
// fixtures/expected/<name>.json. Run `npx tsx fixtures/generators/updateGoldens.ts` to regenerate
// after an intentional behavior change, and review the diff deliberately (make-fixture skill).
// Unlike the iOS set, entries carry their own `asOf` so the AND-16K-* 2027-02-01 severity
// boundary is exercised explicitly, both sides, against the same fixture file.
import { describe, expect, it } from 'vitest';
import { analyzeAab, analyzeApk } from '../packages/core/src/index.ts';
import { parseRulesFile } from '../packages/core/src/rules/types.ts';
import { BlobByteSource } from '../packages/core/src/zip/byteSource.ts';
import { TOOL_VERSION } from './helpers/toolVersion.ts';
import { loadRulesData, readExpected, readFixtureBlob } from './helpers/loadFixture.ts';

const rulesFileResult = parseRulesFile(loadRulesData());
if (!rulesFileResult.ok) throw new Error('rules/rules.json is invalid');
const rulesFile = rulesFileResult.value;

interface AndroidFixtureCase {
  readonly fileName: string;
  readonly asOf: string;
  readonly goldenName: string;
}

const DEFAULT_AS_OF = '2026-10-20';

function fixture(fileName: string, asOf = DEFAULT_AS_OF, goldenName?: string): AndroidFixtureCase {
  return { fileName, asOf, goldenName: goldenName ?? fileName.replace(/\.(aab|apk)$/, '') };
}

const ANDROID_FIXTURES: readonly AndroidFixtureCase[] = [
  fixture('android-aab-passing.aab'),
  fixture('android-aab-tsdk-low.aab'),
  fixture('android-aab-tsdk-wear.aab'),
  fixture('android-aab-tsdk-tv.aab'),
  fixture('android-aab-tsdk-preview.aab'),
  fixture('android-aab-missing-uses-sdk.aab'),
  // 16 KB rule boundary (brief §10 M2 "done when"): a warning before 2027-02-01, an error on/after.
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

describe('Android fixture golden tests', () => {
  for (const { fileName, asOf, goldenName } of ANDROID_FIXTURES) {
    it(`${fileName} as of ${asOf} matches fixtures/expected/${goldenName}.json`, async () => {
      const blob = readFixtureBlob(fileName);
      const analyze = fileName.endsWith('.aab') ? analyzeAab : analyzeApk;
      const result = await analyze(new BlobByteSource(blob), {
        fileName,
        asOf,
        toolVersion: TOOL_VERSION,
        rules: rulesFile,
      });
      expect(result).toEqual(readExpected(goldenName));
    });
  }
});
