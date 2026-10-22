import { isPlistArray, isPlistDict } from '../plist/types.ts';
import type { PlistValue } from '../plist/types.ts';
import type { RequiredReasonSeed } from './requiredReason.ts';

export interface AccessedApiTypeEntry {
  readonly category: string;
  readonly reasons: readonly string[];
}

export interface PrivacyManifestFacts {
  /** `true` when the manifest's structure itself is invalid (IOS-PRIV-003, "certain"). */
  readonly malformed: boolean;
  readonly tracking: boolean | undefined;
  readonly accessedApiTypes: readonly AccessedApiTypeEntry[];
}

/** Reads `PrivacyInfo.xcprivacy`. Never throws; structural problems set `malformed: true`. */
export function extractPrivacyManifestFacts(plist: PlistValue): PrivacyManifestFacts {
  if (!isPlistDict(plist)) {
    return { malformed: true, tracking: undefined, accessedApiTypes: [] };
  }

  const trackingValue = plist.NSPrivacyTracking;
  const tracking = typeof trackingValue === 'boolean' ? trackingValue : undefined;

  const typesValue = plist.NSPrivacyAccessedAPITypes;
  if (typesValue === undefined) {
    return { malformed: false, tracking, accessedApiTypes: [] };
  }
  if (!isPlistArray(typesValue)) {
    return { malformed: true, tracking, accessedApiTypes: [] };
  }

  const accessedApiTypes: AccessedApiTypeEntry[] = [];
  let malformed = false;
  for (const entry of typesValue) {
    if (!isPlistDict(entry)) {
      malformed = true;
      continue;
    }
    const category = entry.NSPrivacyAccessedAPIType;
    const reasonsValue = entry.NSPrivacyAccessedAPITypeReasons;
    if (typeof category !== 'string' || !isPlistArray(reasonsValue)) {
      malformed = true;
      continue;
    }
    const reasons = reasonsValue.filter((reason): reason is string => typeof reason === 'string');
    if (reasons.length !== reasonsValue.length) {
      malformed = true;
    }
    accessedApiTypes.push({ category, reasons });
  }
  return { malformed, tracking, accessedApiTypes };
}

/** `true` when any declared category or reason code is not in the known seed data (IOS-PRIV-003). */
export function hasUnknownCategoryOrReason(
  facts: PrivacyManifestFacts,
  seed: RequiredReasonSeed,
): boolean {
  const known = new Map(
    seed.categories.map((category) => [category.type, new Set(category.reasonCodes)]),
  );
  for (const entry of facts.accessedApiTypes) {
    const reasonCodes = known.get(entry.category);
    if (!reasonCodes) {
      return true;
    }
    for (const reason of entry.reasons) {
      if (!reasonCodes.has(reason)) {
        return true;
      }
    }
  }
  return false;
}

/** The set of categories this manifest declares (used to check IOS-PRIV-002 coverage). */
export function declaredCategories(facts: PrivacyManifestFacts): Set<string> {
  return new Set(facts.accessedApiTypes.map((entry) => entry.category));
}
