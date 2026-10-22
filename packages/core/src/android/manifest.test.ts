import { describe, expect, it } from 'vitest';
import {
  extractManifestFacts,
  RES_ID_MIN_SDK_VERSION,
  RES_ID_NAME,
  RES_ID_TARGET_SDK_VERSION,
  RES_ID_VERSION_CODE,
  RES_ID_VERSION_NAME,
  type AttributeValue,
  type RawAttribute,
  type RawElement,
} from './manifest.ts';

function manifest(
  children: readonly RawElement[] = [],
  extra: readonly RawAttribute[] = [],
): RawElement {
  return {
    name: 'manifest',
    attributes: [
      {
        name: 'package',
        resourceId: undefined,
        value: { kind: 'string', value: 'com.example.app' },
      },
      { name: 'versionCode', resourceId: RES_ID_VERSION_CODE, value: { kind: 'int', value: 7 } },
      {
        name: 'versionName',
        resourceId: RES_ID_VERSION_NAME,
        value: { kind: 'string', value: '1.2.3' },
      },
      ...extra,
    ],
    children,
  };
}

function usesSdk(minSdk: number | undefined, targetSdk: AttributeValue | undefined): RawElement {
  const attributes: RawAttribute[] = [];
  if (minSdk !== undefined) {
    attributes.push({
      name: 'minSdkVersion',
      resourceId: RES_ID_MIN_SDK_VERSION,
      value: { kind: 'int', value: minSdk },
    });
  }
  if (targetSdk !== undefined) {
    attributes.push({
      name: 'targetSdkVersion',
      resourceId: RES_ID_TARGET_SDK_VERSION,
      value: targetSdk,
    });
  }
  return { name: 'uses-sdk', attributes, children: [] };
}

function usesFeature(name: string): RawElement {
  return {
    name: 'uses-feature',
    attributes: [{ name: 'name', resourceId: RES_ID_NAME, value: { kind: 'string', value: name } }],
    children: [],
  };
}

describe('extractManifestFacts', () => {
  it('reads package/version facts and a released target SDK', () => {
    const facts = extractManifestFacts(manifest([usesSdk(24, { kind: 'int', value: 36 })]));
    expect(facts.packageName).toBe('com.example.app');
    expect(facts.versionCode).toBe(7);
    expect(facts.versionName).toBe('1.2.3');
    expect(facts.minSdkVersion).toBe(24);
    expect(facts.targetSdkVersion).toEqual({ kind: 'released', value: 36 });
    expect(facts.targetSdkAssumed).toBe(false);
  });

  it('defaults minSdkVersion to 1 and assumes target SDK when <uses-sdk> is missing', () => {
    const facts = extractManifestFacts(manifest([]));
    expect(facts.minSdkVersion).toBe(1);
    expect(facts.targetSdkVersion).toEqual({ kind: 'released', value: 1 });
    expect(facts.targetSdkAssumed).toBe(true);
  });

  it('assumes target SDK from minSdkVersion when targetSdkVersion is missing', () => {
    const facts = extractManifestFacts(manifest([usesSdk(28, undefined)]));
    expect(facts.minSdkVersion).toBe(28);
    expect(facts.targetSdkVersion).toEqual({ kind: 'released', value: 28 });
    expect(facts.targetSdkAssumed).toBe(true);
  });

  it('treats a non-numeric targetSdkVersion as a preview codename', () => {
    const facts = extractManifestFacts(
      manifest([usesSdk(36, { kind: 'string', value: 'Baklava' })]),
    );
    expect(facts.targetSdkVersion).toEqual({ kind: 'preview', codename: 'Baklava' });
    expect(facts.targetSdkAssumed).toBe(false);
  });

  it('collects uses-feature names', () => {
    const facts = extractManifestFacts(
      manifest([
        usesFeature('android.hardware.type.watch'),
        usesFeature('android.hardware.camera'),
      ]),
    );
    expect(facts.usesFeatures).toEqual(['android.hardware.type.watch', 'android.hardware.camera']);
  });

  it('falls back to matching by attribute name when resourceId is absent', () => {
    const facts = extractManifestFacts(
      manifest([
        {
          name: 'uses-sdk',
          attributes: [
            { name: 'minSdkVersion', resourceId: undefined, value: { kind: 'int', value: 21 } },
          ],
          children: [],
        },
      ]),
    );
    expect(facts.minSdkVersion).toBe(21);
  });
});
