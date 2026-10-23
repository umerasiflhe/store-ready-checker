import { describe, expect, it } from 'vitest';
import requiredReasonJson from '../../../../rules/apple-required-reason-apis.json' with { type: 'json' };
import {
  detectRequiredReasonUsage,
  parseRequiredReasonSeed,
  undeclaredUsage,
} from './requiredReason.ts';

const SEED_JSON = {
  categories: [
    {
      type: 'NSPrivacyAccessedAPICategoryUserDefaults',
      reasonCodes: ['CA92.1'],
      evidence: { symbols: ['_OBJC_CLASS_$_NSUserDefaults'], selectors: [] },
    },
    {
      type: 'NSPrivacyAccessedAPICategorySystemBootTime',
      reasonCodes: ['35F9.1'],
      evidence: { symbols: ['_mach_absolute_time'], selectors: ['systemUptime'] },
    },
  ],
};

describe('parseRequiredReasonSeed', () => {
  it('parses valid seed data', () => {
    const result = parseRequiredReasonSeed(SEED_JSON);
    expect(result).toEqual({ ok: true, value: SEED_JSON });
  });

  it('returns a typed error, never throws, for malformed seed data', () => {
    expect(parseRequiredReasonSeed(null).ok).toBe(false);
    expect(parseRequiredReasonSeed({}).ok).toBe(false);
    expect(parseRequiredReasonSeed({ categories: [{ type: 'X' }] }).ok).toBe(false);
    expect(parseRequiredReasonSeed('nope').ok).toBe(false);
  });
});

describe('detectRequiredReasonUsage', () => {
  const seed = parseRequiredReasonSeed(SEED_JSON);
  if (!seed.ok) throw new Error('seed fixture is invalid');

  it('matches on symbols', () => {
    const detected = detectRequiredReasonUsage(
      { symbols: ['_OBJC_CLASS_$_NSUserDefaults'], selectors: [] },
      seed.value,
    );
    expect(detected).toEqual([
      {
        category: 'NSPrivacyAccessedAPICategoryUserDefaults',
        matchedSymbols: ['_OBJC_CLASS_$_NSUserDefaults'],
        matchedSelectors: [],
      },
    ]);
  });

  it('matches on selectors', () => {
    const detected = detectRequiredReasonUsage(
      { symbols: [], selectors: ['systemUptime'] },
      seed.value,
    );
    expect(detected).toEqual([
      {
        category: 'NSPrivacyAccessedAPICategorySystemBootTime',
        matchedSymbols: [],
        matchedSelectors: ['systemUptime'],
      },
    ]);
  });

  it('returns nothing when no evidence matches', () => {
    expect(
      detectRequiredReasonUsage({ symbols: ['_unrelated'], selectors: [] }, seed.value),
    ).toEqual([]);
  });
});

describe('undeclaredUsage (real seed)', () => {
  const parsed = parseRequiredReasonSeed(requiredReasonJson);
  if (!parsed.ok) throw new Error('rules/apple-required-reason-apis.json is invalid');
  const realSeed = parsed.value;
  const FILE_TIMESTAMP = 'NSPrivacyAccessedAPICategoryFileTimestamp';
  const DISK_SPACE = 'NSPrivacyAccessedAPICategoryDiskSpace';

  function undeclaredFor(symbols: string[], declared: string[], selectors: string[] = []) {
    const usage = detectRequiredReasonUsage({ symbols, selectors }, realSeed);
    return undeclaredUsage(usage, new Set(declared), realSeed).map((u) => u.category);
  }

  it('detects getattrlist as both FileTimestamp and DiskSpace', () => {
    expect(undeclaredFor(['_getattrlist'], [])).toEqual([FILE_TIMESTAMP, DISK_SPACE]);
  });

  it('accepts either category for an API Apple lists under both', () => {
    expect(undeclaredFor(['_getattrlist'], [DISK_SPACE])).toEqual([]);
    expect(undeclaredFor(['_fgetattrlist'], [FILE_TIMESTAMP])).toEqual([]);
  });

  it('still flags a category whose other APIs are not covered', () => {
    // statfs is DiskSpace only, so declaring FileTimestamp covers getattrlist but not statfs.
    expect(undeclaredFor(['_getattrlist', '_statfs'], [FILE_TIMESTAMP])).toEqual([DISK_SPACE]);
  });

  it('detects UIDocument.fileModificationDate as FileTimestamp', () => {
    expect(undeclaredFor([], [], ['fileModificationDate'])).toEqual([FILE_TIMESTAMP]);
  });
});
