import { describe, expect, it } from 'vitest';
import listedSdksJson from '../../../../../rules/apple-listed-sdks.json' with { type: 'json' };
import requiredReasonApisJson from '../../../../../rules/apple-required-reason-apis.json' with { type: 'json' };
import rulesJson from '../../../../../rules/rules.json' with { type: 'json' };
import type { BundleFacts, IosFacts } from '../../ios/analyze.ts';
import { parseListedSdksSeed } from '../../ios/listedSdks.ts';
import { parseRequiredReasonSeed } from '../../ios/requiredReason.ts';
import { evaluateIosRules } from '../engine.ts';
import { parseRulesFile } from '../types.ts';

const rulesFileResult = parseRulesFile(rulesJson);
if (!rulesFileResult.ok) throw new Error('rules/rules.json is invalid');
const rulesFile = rulesFileResult.value;

const listedSdksResult = parseListedSdksSeed(listedSdksJson);
if (!listedSdksResult.ok) throw new Error('rules/apple-listed-sdks.json is invalid');

const requiredReasonApisResult = parseRequiredReasonSeed(requiredReasonApisJson);
if (!requiredReasonApisResult.ok)
  throw new Error('rules/apple-required-reason-apis.json is invalid');

const seeds = {
  listedSdks: listedSdksResult.value,
  requiredReasonApis: requiredReasonApisResult.value,
};

function bundle(overrides: Partial<BundleFacts>): BundleFacts {
  return {
    kind: 'app',
    path: 'Payload/MyApp.app',
    info: {
      bundleIdentifier: undefined,
      shortVersionString: undefined,
      bundleVersion: undefined,
      minimumOSVersion: undefined,
      executableName: undefined,
      dtXcode: undefined,
      dtXcodeBuild: undefined,
      dtSdkName: undefined,
      dtPlatformVersion: undefined,
      dtPlatformName: undefined,
    },
    machO: undefined,
    privacyManifest: undefined,
    requiredReasonUsage: [],
    ...overrides,
  };
}

function facts(...bundles: BundleFacts[]): IosFacts {
  return { bundles };
}

function findingsFor(ruleId: string, data: IosFacts, asOf = '2026-10-20') {
  return evaluateIosRules(data, rulesFile, asOf, seeds).filter((f) => f.ruleId === ruleId);
}

describe('IOS-SDK-001', () => {
  it('flags an app built with an old Xcode/SDK', () => {
    const found = findingsFor(
      'IOS-SDK-001',
      facts(bundle({ info: { ...bundle({}).info, dtXcode: '1640', dtSdkName: 'iphoneos18.5' } })),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('error');
  });

  it('passes a bundle built with Xcode 26 / iOS 26 SDK', () => {
    const found = findingsFor(
      'IOS-SDK-001',
      facts(bundle({ info: { ...bundle({}).info, dtXcode: '2600', dtSdkName: 'iphoneos26.0' } })),
    );
    expect(found).toEqual([]);
  });

  it('checks each app extension independently', () => {
    const found = findingsFor(
      'IOS-SDK-001',
      facts(
        bundle({ info: { ...bundle({}).info, dtXcode: '2600', dtPlatformVersion: '26.0' } }),
        bundle({
          kind: 'appex',
          path: 'Payload/MyApp.app/PlugIns/Share.appex',
          info: { ...bundle({}).info, dtXcode: '1640', dtSdkName: 'iphoneos18.5' },
        }),
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.evidence.bundle).toBe('Payload/MyApp.app/PlugIns/Share.appex');
  });

  it('skips a bundle with no DTXcode evidence', () => {
    expect(findingsFor('IOS-SDK-001', facts(bundle({})))).toEqual([]);
  });
});

describe('IOS-MINOS-001', () => {
  it('flags a MinimumOSVersion below 13.0', () => {
    const found = findingsFor(
      'IOS-MINOS-001',
      facts(bundle({ info: { ...bundle({}).info, minimumOSVersion: '12.0' } })),
    );
    expect(found).toHaveLength(1);
  });

  it('passes a MinimumOSVersion at or above 13.0', () => {
    expect(
      findingsFor(
        'IOS-MINOS-001',
        facts(bundle({ info: { ...bundle({}).info, minimumOSVersion: '13.0' } })),
      ),
    ).toEqual([]);
    expect(
      findingsFor(
        'IOS-MINOS-001',
        facts(bundle({ info: { ...bundle({}).info, minimumOSVersion: '15.2' } })),
      ),
    ).toEqual([]);
  });
});

describe('IOS-PRIV-001', () => {
  it('flags required-reason usage with no privacy manifest', () => {
    const found = findingsFor(
      'IOS-PRIV-001',
      facts(
        bundle({
          machO: { encrypted: false, symbols: ['_stat'], selectors: [] },
          requiredReasonUsage: [
            {
              category: 'NSPrivacyAccessedAPICategoryFileTimestamp',
              matchedSymbols: ['_stat'],
              matchedSelectors: [],
            },
          ],
        }),
      ),
    );
    expect(found).toHaveLength(1);
  });

  it('passes when a privacy manifest is present, regardless of its content', () => {
    const found = findingsFor(
      'IOS-PRIV-001',
      facts(
        bundle({
          machO: { encrypted: false, symbols: ['_stat'], selectors: [] },
          requiredReasonUsage: [
            {
              category: 'NSPrivacyAccessedAPICategoryFileTimestamp',
              matchedSymbols: ['_stat'],
              matchedSelectors: [],
            },
          ],
          privacyManifest: { malformed: false, tracking: undefined, accessedApiTypes: [] },
        }),
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('IOS-PRIV-002', () => {
  it('flags a detected category missing from the manifest', () => {
    const found = findingsFor(
      'IOS-PRIV-002',
      facts(
        bundle({
          machO: { encrypted: false, symbols: ['_statfs'], selectors: [] },
          requiredReasonUsage: [
            {
              category: 'NSPrivacyAccessedAPICategoryDiskSpace',
              matchedSymbols: ['_statfs'],
              matchedSelectors: [],
            },
          ],
          privacyManifest: {
            malformed: false,
            tracking: undefined,
            accessedApiTypes: [
              { category: 'NSPrivacyAccessedAPICategoryFileTimestamp', reasons: ['DDA9.1'] },
            ],
          },
        }),
      ),
    );
    expect(found).toHaveLength(1);
  });

  it('passes when the category is declared', () => {
    const found = findingsFor(
      'IOS-PRIV-002',
      facts(
        bundle({
          machO: { encrypted: false, symbols: ['_statfs'], selectors: [] },
          requiredReasonUsage: [
            {
              category: 'NSPrivacyAccessedAPICategoryDiskSpace',
              matchedSymbols: ['_statfs'],
              matchedSelectors: [],
            },
          ],
          privacyManifest: {
            malformed: false,
            tracking: undefined,
            accessedApiTypes: [
              { category: 'NSPrivacyAccessedAPICategoryDiskSpace', reasons: ['85F4.1'] },
            ],
          },
        }),
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('IOS-PRIV-003', () => {
  it('flags a malformed manifest', () => {
    const found = findingsFor(
      'IOS-PRIV-003',
      facts(
        bundle({ privacyManifest: { malformed: true, tracking: undefined, accessedApiTypes: [] } }),
      ),
    );
    expect(found).toHaveLength(1);
  });

  it('flags an unknown category', () => {
    const found = findingsFor(
      'IOS-PRIV-003',
      facts(
        bundle({
          privacyManifest: {
            malformed: false,
            tracking: undefined,
            accessedApiTypes: [
              { category: 'NSPrivacyAccessedAPICategoryNotReal', reasons: ['X.1'] },
            ],
          },
        }),
      ),
    );
    expect(found).toHaveLength(1);
  });

  it('flags a known category with an unknown reason code', () => {
    const found = findingsFor(
      'IOS-PRIV-003',
      facts(
        bundle({
          privacyManifest: {
            malformed: false,
            tracking: undefined,
            accessedApiTypes: [
              { category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['NOT.1'] },
            ],
          },
        }),
      ),
    );
    expect(found).toHaveLength(1);
  });

  it('passes a well-formed manifest with known categories and reasons', () => {
    const found = findingsFor(
      'IOS-PRIV-003',
      facts(
        bundle({
          privacyManifest: {
            malformed: false,
            tracking: undefined,
            accessedApiTypes: [
              { category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] },
            ],
          },
        }),
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('IOS-PRIV-004', () => {
  it('flags a listed SDK framework with no privacy manifest', () => {
    const found = findingsFor(
      'IOS-PRIV-004',
      facts(
        bundle({ kind: 'framework', path: 'Payload/MyApp.app/Frameworks/Alamofire.framework' }),
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
  });

  it('passes a listed SDK framework that ships its own privacy manifest', () => {
    const found = findingsFor(
      'IOS-PRIV-004',
      facts(
        bundle({
          kind: 'framework',
          path: 'Payload/MyApp.app/Frameworks/Alamofire.framework',
          privacyManifest: { malformed: false, tracking: undefined, accessedApiTypes: [] },
        }),
      ),
    );
    expect(found).toEqual([]);
  });

  it('passes a framework that is not on the listed-SDK list', () => {
    const found = findingsFor(
      'IOS-PRIV-004',
      facts(
        bundle({
          kind: 'framework',
          path: 'Payload/MyApp.app/Frameworks/MyOwnFramework.framework',
        }),
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('IOS-INFO-001', () => {
  it('reports an info finding for an encrypted executable', () => {
    const found = findingsFor(
      'IOS-INFO-001',
      facts(bundle({ machO: { encrypted: true, symbols: [], selectors: [] } })),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('info');
  });

  it('is silent for an unencrypted executable', () => {
    expect(
      findingsFor(
        'IOS-INFO-001',
        facts(bundle({ machO: { encrypted: false, symbols: [], selectors: [] } })),
      ),
    ).toEqual([]);
  });
});
