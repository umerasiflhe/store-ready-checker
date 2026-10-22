import { isPlistDict } from '../plist/types.ts';
import type { PlistValue } from '../plist/types.ts';

export interface InfoPlistFacts {
  readonly bundleIdentifier: string | undefined;
  readonly shortVersionString: string | undefined;
  readonly bundleVersion: string | undefined;
  readonly minimumOSVersion: string | undefined;
  readonly executableName: string | undefined;
  readonly dtXcode: string | undefined;
  readonly dtXcodeBuild: string | undefined;
  readonly dtSdkName: string | undefined;
  readonly dtPlatformVersion: string | undefined;
  readonly dtPlatformName: string | undefined;
}

const EMPTY_FACTS: InfoPlistFacts = {
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
};

/** Reads the handful of Info.plist keys the rules engine needs. Never throws. */
export function extractInfoPlistFacts(plist: PlistValue): InfoPlistFacts {
  if (!isPlistDict(plist)) {
    return EMPTY_FACTS;
  }
  return {
    bundleIdentifier: stringField(plist, 'CFBundleIdentifier'),
    shortVersionString: stringField(plist, 'CFBundleShortVersionString'),
    bundleVersion: stringField(plist, 'CFBundleVersion'),
    minimumOSVersion: stringField(plist, 'MinimumOSVersion'),
    executableName: stringField(plist, 'CFBundleExecutable'),
    dtXcode: stringField(plist, 'DTXcode'),
    dtXcodeBuild: stringField(plist, 'DTXcodeBuild'),
    dtSdkName: stringField(plist, 'DTSDKName'),
    dtPlatformVersion: stringField(plist, 'DTPlatformVersion'),
    dtPlatformName: stringField(plist, 'DTPlatformName'),
  };
}

function stringField(dict: Record<string, PlistValue>, key: string): string | undefined {
  const value = dict[key];
  if (typeof value === 'string') {
    return value;
  }
  // DTXcode and friends are documented as strings, but tolerate a plist integer too.
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}
