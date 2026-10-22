import { describe, expect, it } from 'vitest';
import { frameworkNameOf, isListedSdk, parseListedSdksSeed } from './listedSdks.ts';

describe('parseListedSdksSeed', () => {
  it('parses valid seed data', () => {
    expect(parseListedSdksSeed({ frameworks: ['Alamofire', 'SDWebImage'] })).toEqual({
      ok: true,
      value: { frameworks: ['Alamofire', 'SDWebImage'] },
    });
  });

  it('returns a typed error, never throws, for malformed data', () => {
    expect(parseListedSdksSeed(null).ok).toBe(false);
    expect(parseListedSdksSeed({}).ok).toBe(false);
    expect(parseListedSdksSeed({ frameworks: [1, 2] }).ok).toBe(false);
  });
});

describe('frameworkNameOf', () => {
  it('extracts the framework name from a bundle path', () => {
    expect(frameworkNameOf('Payload/MyApp.app/Frameworks/Alamofire.framework')).toBe('Alamofire');
  });

  it('returns undefined for a non-framework path', () => {
    expect(frameworkNameOf('Payload/MyApp.app')).toBeUndefined();
  });
});

describe('isListedSdk', () => {
  it('matches a listed framework', () => {
    expect(isListedSdk('Alamofire', { frameworks: ['Alamofire'] })).toBe(true);
  });

  it('does not match an unlisted framework', () => {
    expect(isListedSdk('MyOwnFramework', { frameworks: ['Alamofire'] })).toBe(false);
  });
});
