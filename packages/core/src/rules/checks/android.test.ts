import { describe, expect, it } from 'vitest';
import rulesJson from '../../../../../rules/rules.json' with { type: 'json' };
import type { AndroidFacts, ModuleFacts } from '../../android/analyze.ts';
import { PT_GNU_RELRO, PT_LOAD, type ProgramHeader } from '../../android/elf.ts';
import type { ManifestFacts } from '../../android/manifest.ts';
import type { NativeLibFacts } from '../../android/nativeLibs.ts';
import { evaluateAndroidRules } from '../engine.ts';
import { parseRulesFile } from '../types.ts';

const rulesFileResult = parseRulesFile(rulesJson);
if (!rulesFileResult.ok) throw new Error('rules/rules.json is invalid');
const rulesFile = rulesFileResult.value;

function manifest(overrides: Partial<ManifestFacts> = {}): ManifestFacts {
  return {
    packageName: 'com.example.app',
    versionCode: 1,
    versionName: '1.0',
    minSdkVersion: 24,
    targetSdkVersion: { kind: 'released', value: 36 },
    targetSdkAssumed: false,
    usesFeatures: [],
    ...overrides,
  };
}

function moduleFacts(overrides: Partial<ModuleFacts> = {}): ModuleFacts {
  return { name: 'base', manifest: manifest(), ...overrides };
}

function programHeader(overrides: Partial<ProgramHeader> = {}): ProgramHeader {
  return { pType: PT_LOAD, pVAddr: 0n, pMemSz: 0n, pAlign: 16384n, ...overrides };
}

function lib(overrides: Partial<NativeLibFacts> = {}): NativeLibFacts {
  return {
    path: 'lib/arm64-v8a/libfoo.so',
    abi: 'arm64-v8a',
    elf: undefined,
    stored: undefined,
    zipDataOffset: undefined,
    ...overrides,
  };
}

function facts(overrides: Partial<AndroidFacts> = {}): AndroidFacts {
  return {
    kind: 'apk',
    modules: [moduleFacts()],
    nativeLibs: { libraries: [] },
    bundleConfig: undefined,
    ...overrides,
  };
}

function findingsFor(ruleId: string, data: AndroidFacts, asOf = '2026-10-20') {
  return evaluateAndroidRules(data, rulesFile, asOf).filter((f) => f.ruleId === ruleId);
}

describe('AND-TSDK-001', () => {
  it('flags a phone/tablet app below the required targetSdkVersion', () => {
    const data = facts({
      modules: [
        moduleFacts({ manifest: manifest({ targetSdkVersion: { kind: 'released', value: 30 } }) }),
      ],
    });
    expect(findingsFor('AND-TSDK-001', data)).toHaveLength(1);
  });

  it('passes a phone/tablet app at the required targetSdkVersion', () => {
    const data = facts();
    expect(findingsFor('AND-TSDK-001', data)).toHaveLength(0);
  });

  it('uses the wear minimum for a watch form factor', () => {
    const wearManifest = manifest({
      targetSdkVersion: { kind: 'released', value: 34 },
      usesFeatures: ['android.hardware.type.watch'],
    });
    const data = facts({ modules: [moduleFacts({ manifest: wearManifest })] });
    expect(findingsFor('AND-TSDK-001', data)).toHaveLength(1);

    const passing = facts({
      modules: [
        moduleFacts({
          manifest: manifest({
            targetSdkVersion: { kind: 'released', value: 35 },
            usesFeatures: ['android.hardware.type.watch'],
          }),
        }),
      ],
    });
    expect(findingsFor('AND-TSDK-001', passing)).toHaveLength(0);
  });

  it('prefers an explicit formFactorOverride over the manifest-inferred form factor', () => {
    // No usesFeatures declared, so inference alone would treat this as phone/tablet (min 36).
    const data = facts({
      modules: [
        moduleFacts({ manifest: manifest({ targetSdkVersion: { kind: 'released', value: 34 } }) }),
      ],
    });
    expect(
      evaluateAndroidRules(data, rulesFile, '2026-10-20').filter(
        (f) => f.ruleId === 'AND-TSDK-001',
      ),
    ).toHaveLength(1);

    const overridden = evaluateAndroidRules(data, rulesFile, '2026-10-20', {
      formFactorOverride: 'tv',
    }).filter((f) => f.ruleId === 'AND-TSDK-001');
    expect(overridden).toHaveLength(0);
  });

  it('never flags a preview codename targetSdkVersion', () => {
    const data = facts({
      modules: [
        moduleFacts({
          manifest: manifest({ targetSdkVersion: { kind: 'preview', codename: 'Baklava' } }),
        }),
      ],
    });
    expect(findingsFor('AND-TSDK-001', data)).toHaveLength(0);
  });
});

describe('AND-TSDK-002', () => {
  it('warns below the minimum targetSdkVersion', () => {
    const data = facts({
      modules: [
        moduleFacts({ manifest: manifest({ targetSdkVersion: { kind: 'released', value: 30 } }) }),
      ],
    });
    const found = findingsFor('AND-TSDK-002', data);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
  });

  it('passes at the minimum targetSdkVersion', () => {
    expect(findingsFor('AND-TSDK-002', facts())).toHaveLength(0);
  });
});

describe('AND-16K-001', () => {
  it('flags a misaligned PT_LOAD segment when targetSdkVersion qualifies', () => {
    const data = facts({
      nativeLibs: {
        libraries: [lib({ elf: { programHeaders: [programHeader({ pAlign: 4096n })] } })],
      },
    });
    expect(findingsFor('AND-16K-001', data)).toHaveLength(1);
  });

  it('passes an aligned PT_LOAD segment', () => {
    const data = facts({
      nativeLibs: { libraries: [lib({ elf: { programHeaders: [programHeader()] } })] },
    });
    expect(findingsFor('AND-16K-001', data)).toHaveLength(0);
  });

  it('does not apply below the targetSdkVersion threshold', () => {
    const data = facts({
      modules: [
        moduleFacts({ manifest: manifest({ targetSdkVersion: { kind: 'released', value: 30 } }) }),
      ],
      nativeLibs: {
        libraries: [lib({ elf: { programHeaders: [programHeader({ pAlign: 4096n })] } })],
      },
    });
    expect(findingsFor('AND-16K-001', data)).toHaveLength(0);
  });

  it('is a warning before 2027-02-01 and an error on/after it', () => {
    const data = facts({
      nativeLibs: {
        libraries: [lib({ elf: { programHeaders: [programHeader({ pAlign: 4096n })] } })],
      },
    });
    expect(findingsFor('AND-16K-001', data, '2026-10-20')[0]?.severity).toBe('warning');
    expect(findingsFor('AND-16K-001', data, '2027-02-01')[0]?.severity).toBe('error');
  });

  it('ignores ABIs the 16 KB rules do not apply to', () => {
    const data = facts({
      nativeLibs: {
        libraries: [
          lib({ abi: 'armeabi-v7a', elf: { programHeaders: [programHeader({ pAlign: 4096n })] } }),
        ],
      },
    });
    expect(findingsFor('AND-16K-001', data)).toHaveLength(0);
  });
});

describe('AND-16K-002', () => {
  it('flags a GNU_RELRO segment that ends unaligned', () => {
    const data = facts({
      nativeLibs: {
        libraries: [
          lib({
            elf: {
              programHeaders: [
                programHeader({ pType: PT_GNU_RELRO, pVAddr: 0x1000n, pMemSz: 0x2500n }),
              ],
            },
          }),
        ],
      },
    });
    expect(findingsFor('AND-16K-002', data)).toHaveLength(1);
  });

  it('passes a GNU_RELRO segment that ends aligned', () => {
    const data = facts({
      nativeLibs: {
        libraries: [
          lib({
            elf: {
              programHeaders: [
                programHeader({ pType: PT_GNU_RELRO, pVAddr: 0x1000n, pMemSz: 0x3000n }),
              ],
            },
          }),
        ],
      },
    });
    expect(findingsFor('AND-16K-002', data)).toHaveLength(0);
  });

  it('exempts a GNU_RELRO segment that occupies its own PT_LOAD segment', () => {
    const data = facts({
      nativeLibs: {
        libraries: [
          lib({
            elf: {
              programHeaders: [
                programHeader({ pType: PT_LOAD, pVAddr: 0x1000n, pMemSz: 0x2500n, pAlign: 16384n }),
                programHeader({ pType: PT_GNU_RELRO, pVAddr: 0x1000n, pMemSz: 0x2500n }),
              ],
            },
          }),
        ],
      },
    });
    expect(findingsFor('AND-16K-002', data)).toHaveLength(0);
  });
});

describe('AND-16K-003', () => {
  it('flags a stored, misaligned native library in an APK', () => {
    const data = facts({
      nativeLibs: { libraries: [lib({ stored: true, zipDataOffset: 100 })] },
    });
    expect(findingsFor('AND-16K-003', data)).toHaveLength(1);
  });

  it('passes a stored, aligned native library', () => {
    const data = facts({
      nativeLibs: { libraries: [lib({ stored: true, zipDataOffset: 16384 })] },
    });
    expect(findingsFor('AND-16K-003', data)).toHaveLength(0);
  });

  it('does not apply to a compressed native library', () => {
    const data = facts({ nativeLibs: { libraries: [lib({ stored: false })] } });
    expect(findingsFor('AND-16K-003', data)).toHaveLength(0);
  });

  it('does not apply to an AAB', () => {
    const data = facts({
      kind: 'aab',
      nativeLibs: { libraries: [lib({ stored: true, zipDataOffset: 100 })] },
    });
    expect(findingsFor('AND-16K-003', data)).toHaveLength(0);
  });
});

describe('AND-16K-004', () => {
  it('flags an AAB with uncompressed native libs but no 16K alignment flag', () => {
    const data = facts({
      kind: 'aab',
      bundleConfig: { nativeLibrariesUncompressed: true, nativeLibraryPageAlignment16K: false },
    });
    expect(findingsFor('AND-16K-004', data)).toHaveLength(1);
  });

  it('passes when the 16K alignment flag is set', () => {
    const data = facts({
      kind: 'aab',
      bundleConfig: { nativeLibrariesUncompressed: true, nativeLibraryPageAlignment16K: true },
    });
    expect(findingsFor('AND-16K-004', data)).toHaveLength(0);
  });

  it('does not apply when native libs are not uncompressed', () => {
    const data = facts({
      kind: 'aab',
      bundleConfig: { nativeLibrariesUncompressed: false, nativeLibraryPageAlignment16K: false },
    });
    expect(findingsFor('AND-16K-004', data)).toHaveLength(0);
  });

  it('does not apply to an APK', () => {
    const data = facts({
      kind: 'apk',
      bundleConfig: { nativeLibrariesUncompressed: true, nativeLibraryPageAlignment16K: false },
    });
    expect(findingsFor('AND-16K-004', data)).toHaveLength(0);
  });
});

describe('AND-64BIT-001', () => {
  it('flags armeabi-v7a without a matching arm64-v8a library', () => {
    const data = facts({ nativeLibs: { libraries: [lib({ abi: 'armeabi-v7a' })] } });
    expect(findingsFor('AND-64BIT-001', data)).toHaveLength(1);
  });

  it('flags x86 without a matching x86_64 library', () => {
    const data = facts({ nativeLibs: { libraries: [lib({ abi: 'x86' })] } });
    expect(findingsFor('AND-64BIT-001', data)).toHaveLength(1);
  });

  it('passes when both 32-bit and 64-bit ABIs are present', () => {
    const data = facts({
      nativeLibs: { libraries: [lib({ abi: 'armeabi-v7a' }), lib({ abi: 'arm64-v8a' })] },
    });
    expect(findingsFor('AND-64BIT-001', data)).toHaveLength(0);
  });

  it('passes when there is no 32-bit native code at all', () => {
    expect(findingsFor('AND-64BIT-001', facts())).toHaveLength(0);
  });
});

describe('AND-INFO-001', () => {
  it('fires when there is no native code at all', () => {
    expect(findingsFor('AND-INFO-001', facts())).toHaveLength(1);
  });

  it('fires when only legacy 32-bit ABIs are present', () => {
    const data = facts({ nativeLibs: { libraries: [lib({ abi: 'armeabi-v7a' })] } });
    expect(findingsFor('AND-INFO-001', data)).toHaveLength(1);
  });

  it('does not fire once a 64-bit-relevant ABI is present', () => {
    const data = facts({ nativeLibs: { libraries: [lib({ abi: 'arm64-v8a' })] } });
    expect(findingsFor('AND-INFO-001', data)).toHaveLength(0);
  });
});
