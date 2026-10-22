import { describe, expect, it } from 'vitest';
import { detectKind } from './detectKind.ts';

describe('detectKind', () => {
  it('detects .ipa by extension, case-insensitively', () => {
    expect(detectKind('MyApp.IPA', [])).toBe('ipa');
  });

  it('detects .aab and .apk by extension', () => {
    expect(detectKind('app.aab', [])).toBe('aab');
    expect(detectKind('app.apk', [])).toBe('apk');
  });

  it('falls back to peeking entries for an ipa with no/unknown extension', () => {
    expect(detectKind('upload.bin', [{ filename: 'Payload/MyApp.app/Info.plist' }])).toBe('ipa');
  });

  it('falls back to peeking entries for an aab module manifest', () => {
    expect(detectKind('upload.bin', [{ filename: 'base/manifest/AndroidManifest.xml' }])).toBe(
      'aab',
    );
  });

  it('falls back to peeking entries for an apk root manifest', () => {
    expect(detectKind('upload.bin', [{ filename: 'AndroidManifest.xml' }])).toBe('apk');
  });

  it('returns undefined when nothing matches', () => {
    expect(detectKind('readme.txt', [{ filename: 'README.md' }])).toBeUndefined();
  });
});
