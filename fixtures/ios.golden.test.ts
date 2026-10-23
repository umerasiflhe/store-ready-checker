// Golden tests (brief §7.2): core output for every committed iOS fixture must equal
// fixtures/expected/<name>.json. Run `npx tsx fixtures/generators/updateGoldens.ts` to regenerate
// after an intentional behavior change, and review the diff deliberately (make-fixture skill).
import { describe, expect, it } from 'vitest';
import { analyzeIpa } from '../packages/core/src/index.ts';
import { parseListedSdksSeed } from '../packages/core/src/ios/listedSdks.ts';
import { parseRequiredReasonSeed } from '../packages/core/src/ios/requiredReason.ts';
import { parseRulesFile } from '../packages/core/src/rules/types.ts';
import { BlobByteSource } from '../packages/core/src/zip/byteSource.ts';
import { TOOL_VERSION } from './helpers/toolVersion.ts';
import {
  loadListedSdks,
  loadRequiredReasonApis,
  loadRulesData,
  readExpected,
  readFixtureBlob,
} from './helpers/loadFixture.ts';

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
  'ios-not-a-zip',
  'ios-no-payload',
  'ios-passing-app',
  'ios-old-xcode',
  'ios-old-minos',
  'ios-priv-001-missing-manifest',
  'ios-priv-002-missing-category',
  'ios-priv-002-shared-api-declared',
  'ios-priv-003-bad-reason-code',
  'ios-priv-003-malformed-manifest',
  'ios-priv-004-listed-sdk-no-manifest',
  'ios-priv-004-listed-sdk-with-manifest',
  'ios-appex-old-sdk',
  'ios-fat-binary',
  'ios-encrypted-binary',
  'ios-binary-plist',
];

describe('iOS fixture golden tests', () => {
  for (const name of IOS_FIXTURES) {
    it(`${name}.ipa matches fixtures/expected/${name}.json`, async () => {
      const blob = readFixtureBlob(`${name}.ipa`);
      const result = await analyzeIpa(new BlobByteSource(blob), {
        fileName: `${name}.ipa`,
        asOf: '2026-10-20',
        toolVersion: TOOL_VERSION,
        rules: rulesFile,
        requiredReasonApis,
        listedSdks,
      });
      expect(result).toEqual(readExpected(name));
    });
  }
});
