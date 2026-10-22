import { describe, expect, it } from 'vitest';
import { detectRequiredReasonUsage, parseRequiredReasonSeed } from './requiredReason.ts';

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
