import { describe, expect, it } from 'vitest';
import { extractInfoPlistFacts } from './infoPlist.ts';

describe('extractInfoPlistFacts', () => {
  it('reads every known key', () => {
    const facts = extractInfoPlistFacts({
      CFBundleIdentifier: 'com.example.myapp',
      CFBundleShortVersionString: '2.3.0',
      CFBundleVersion: '45',
      MinimumOSVersion: '15.0',
      CFBundleExecutable: 'MyApp',
      DTXcode: '2600',
      DTXcodeBuild: '16A242d',
      DTSDKName: 'iphoneos26.0',
      DTPlatformVersion: '26.0',
      DTPlatformName: 'iphoneos',
    });
    expect(facts).toEqual({
      bundleIdentifier: 'com.example.myapp',
      shortVersionString: '2.3.0',
      bundleVersion: '45',
      minimumOSVersion: '15.0',
      executableName: 'MyApp',
      dtXcode: '2600',
      dtXcodeBuild: '16A242d',
      dtSdkName: 'iphoneos26.0',
      dtPlatformVersion: '26.0',
      dtPlatformName: 'iphoneos',
    });
  });

  it('tolerates a numeric DTXcode value', () => {
    const facts = extractInfoPlistFacts({ DTXcode: 2600 });
    expect(facts.dtXcode).toBe('2600');
  });

  it('returns all-undefined facts for a non-dict plist', () => {
    const facts = extractInfoPlistFacts('not a dict');
    expect(facts.bundleIdentifier).toBeUndefined();
    expect(facts.minimumOSVersion).toBeUndefined();
  });

  it('leaves missing keys undefined', () => {
    const facts = extractInfoPlistFacts({ CFBundleIdentifier: 'com.example.app' });
    expect(facts.bundleIdentifier).toBe('com.example.app');
    expect(facts.minimumOSVersion).toBeUndefined();
    expect(facts.dtXcode).toBeUndefined();
  });
});
