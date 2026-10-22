import { describe, expect, it } from 'vitest';
import {
  declaredCategories,
  extractPrivacyManifestFacts,
  hasUnknownCategoryOrReason,
} from './privacyManifest.ts';
import { parseRequiredReasonSeed } from './requiredReason.ts';

const seed = parseRequiredReasonSeed({
  categories: [
    {
      type: 'NSPrivacyAccessedAPICategoryUserDefaults',
      reasonCodes: ['CA92.1'],
      evidence: { symbols: [], selectors: [] },
    },
  ],
});
if (!seed.ok) throw new Error('seed fixture is invalid');

describe('extractPrivacyManifestFacts', () => {
  it('reads tracking and accessed API types', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyTracking: true,
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    });
    expect(facts).toEqual({
      malformed: false,
      tracking: true,
      accessedApiTypes: [
        { category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] },
      ],
    });
  });

  it('treats a non-dict plist as malformed', () => {
    expect(extractPrivacyManifestFacts('nope').malformed).toBe(true);
  });

  it('treats a non-array NSPrivacyAccessedAPITypes as malformed', () => {
    expect(extractPrivacyManifestFacts({ NSPrivacyAccessedAPITypes: 'nope' }).malformed).toBe(true);
  });

  it('treats a malformed entry (missing reasons) as malformed, but keeps valid entries', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'X' }, // missing reasons array
        { NSPrivacyAccessedAPIType: 'Y', NSPrivacyAccessedAPITypeReasons: ['Z.1'] },
      ],
    });
    expect(facts.malformed).toBe(true);
    expect(facts.accessedApiTypes).toEqual([{ category: 'Y', reasons: ['Z.1'] }]);
  });

  it('treats a manifest with no NSPrivacyAccessedAPITypes key as valid but empty', () => {
    const facts = extractPrivacyManifestFacts({ NSPrivacyTracking: false });
    expect(facts.malformed).toBe(false);
    expect(facts.accessedApiTypes).toEqual([]);
  });
});

describe('hasUnknownCategoryOrReason', () => {
  it('is false when every category and reason is known', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    });
    expect(hasUnknownCategoryOrReason(facts, seed.value)).toBe(false);
  });

  it('is true for an unknown category', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryNotReal',
          NSPrivacyAccessedAPITypeReasons: ['X.1'],
        },
      ],
    });
    expect(hasUnknownCategoryOrReason(facts, seed.value)).toBe(true);
  });

  it('is true for a known category with an unknown reason code', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['NOT.1'],
        },
      ],
    });
    expect(hasUnknownCategoryOrReason(facts, seed.value)).toBe(true);
  });
});

describe('declaredCategories', () => {
  it('collects the set of declared category names', () => {
    const facts = extractPrivacyManifestFacts({
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'A', NSPrivacyAccessedAPITypeReasons: ['1'] },
        { NSPrivacyAccessedAPIType: 'B', NSPrivacyAccessedAPITypeReasons: ['2'] },
      ],
    });
    expect(declaredCategories(facts)).toEqual(new Set(['A', 'B']));
  });
});
