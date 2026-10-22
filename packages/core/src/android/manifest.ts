// Resource IDs per the Android platform's public attribute list (core/res/res/values/
// public-final.xml in AOSP frameworks/base), stable across releases.
export const RES_ID_NAME = 0x01010003;
export const RES_ID_MIN_SDK_VERSION = 0x0101020c;
export const RES_ID_VERSION_CODE = 0x0101021b;
export const RES_ID_VERSION_NAME = 0x0101021c;
export const RES_ID_TARGET_SDK_VERSION = 0x01010270;

export type AttributeValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean };

export interface RawAttribute {
  readonly name: string;
  readonly resourceId: number | undefined;
  readonly value: AttributeValue;
}

export interface RawElement {
  readonly name: string;
  readonly attributes: readonly RawAttribute[];
  readonly children: readonly RawElement[];
}

export type TargetSdkVersion =
  | { readonly kind: 'released'; readonly value: number }
  | { readonly kind: 'preview'; readonly codename: string };

export interface ManifestFacts {
  readonly packageName: string | undefined;
  readonly versionCode: number | undefined;
  readonly versionName: string | undefined;
  readonly minSdkVersion: number;
  readonly targetSdkVersion: TargetSdkVersion;
  /** `true` when `<uses-sdk>` or its `targetSdkVersion`/`minSdkVersion` attribute was missing and
   * the value below was defaulted rather than read, per the brief: "flag it rather than silently
   * assuming a value." */
  readonly targetSdkAssumed: boolean;
  readonly usesFeatures: readonly string[];
}

function findAttribute(
  element: RawElement,
  resourceId: number,
  name: string,
): RawAttribute | undefined {
  return (
    element.attributes.find((attribute) => attribute.resourceId === resourceId) ??
    element.attributes.find(
      (attribute) => attribute.resourceId === undefined && attribute.name === name,
    )
  );
}

function stringValue(attribute: RawAttribute | undefined): string | undefined {
  if (!attribute) return undefined;
  if (attribute.value.kind === 'string') return attribute.value.value;
  if (attribute.value.kind === 'int') return String(attribute.value.value);
  return undefined;
}

function intValue(attribute: RawAttribute | undefined): number | undefined {
  if (!attribute) return undefined;
  if (attribute.value.kind === 'int') return attribute.value.value;
  if (attribute.value.kind === 'string' && /^\d+$/.test(attribute.value.value)) {
    return Number(attribute.value.value);
  }
  return undefined;
}

function parseTargetSdk(
  attribute: RawAttribute | undefined,
  minSdkVersion: number,
): { readonly targetSdkVersion: TargetSdkVersion; readonly assumed: boolean } {
  if (!attribute) {
    return { targetSdkVersion: { kind: 'released', value: minSdkVersion }, assumed: true };
  }
  const asInt = intValue(attribute);
  if (asInt !== undefined) {
    return { targetSdkVersion: { kind: 'released', value: asInt }, assumed: false };
  }
  const asString = stringValue(attribute);
  if (asString !== undefined) {
    return { targetSdkVersion: { kind: 'preview', codename: asString }, assumed: false };
  }
  return { targetSdkVersion: { kind: 'released', value: minSdkVersion }, assumed: true };
}

/** Extracts the rules-engine-relevant facts from a decoded `<manifest>` element, regardless of
 * whether it came from AAB protobuf or APK AXML. */
export function extractManifestFacts(manifest: RawElement): ManifestFacts {
  const packageName = stringValue(
    manifest.attributes.find(
      (attribute) => attribute.resourceId === undefined && attribute.name === 'package',
    ),
  );
  const versionCode = intValue(findAttribute(manifest, RES_ID_VERSION_CODE, 'versionCode'));
  const versionName = stringValue(findAttribute(manifest, RES_ID_VERSION_NAME, 'versionName'));

  const usesSdk = manifest.children.find((child) => child.name === 'uses-sdk');
  const minSdkAttribute = usesSdk
    ? findAttribute(usesSdk, RES_ID_MIN_SDK_VERSION, 'minSdkVersion')
    : undefined;
  const minSdkVersion = intValue(minSdkAttribute) ?? 1;

  const targetSdkAttribute = usesSdk
    ? findAttribute(usesSdk, RES_ID_TARGET_SDK_VERSION, 'targetSdkVersion')
    : undefined;
  const { targetSdkVersion, assumed } = parseTargetSdk(targetSdkAttribute, minSdkVersion);

  const usesFeatures = manifest.children
    .filter((child) => child.name === 'uses-feature')
    .map((child) => stringValue(findAttribute(child, RES_ID_NAME, 'name')))
    .filter((name): name is string => name !== undefined);

  return {
    packageName,
    versionCode,
    versionName,
    minSdkVersion,
    targetSdkVersion,
    targetSdkAssumed: assumed,
    usesFeatures,
  };
}
