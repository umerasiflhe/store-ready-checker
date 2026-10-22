import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseXmlPlist } from './xml.ts';

const HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`;

function plist(body: string): Uint8Array {
  return new TextEncoder().encode(`${HEADER}\n<plist version="1.0">\n${body}\n</plist>\n`);
}

function unwrapOk<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

describe('parseXmlPlist', () => {
  it('decodes every scalar type inside a dict', () => {
    const value = unwrapOk(
      parseXmlPlist(
        plist(`<dict>
  <key>s</key>
  <string>hello</string>
  <key>i</key>
  <integer>-5</integer>
  <key>r</key>
  <real>1.5</real>
  <key>t</key>
  <true/>
  <key>f</key>
  <false/>
  <key>d</key>
  <date>2026-01-02T03:04:05Z</date>
  <key>data</key>
  <data>AQIDBA==</data>
</dict>`),
      ),
    );
    expect(value).toEqual({
      s: 'hello',
      i: -5,
      r: 1.5,
      t: true,
      f: false,
      d: new Date('2026-01-02T03:04:05Z'),
      data: Uint8Array.of(1, 2, 3, 4),
    });
  });

  it('decodes nested arrays and dicts, preserving key/value pairing across mixed types', () => {
    const value = unwrapOk(
      parseXmlPlist(
        plist(`<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyTracking</key>
  <false/>
</dict>`),
      ),
    );
    expect(value).toEqual({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
      NSPrivacyTracking: false,
    });
  });

  it('decodes a top-level array', () => {
    const value = unwrapOk(
      parseXmlPlist(plist('<array><string>a</string><string>b</string></array>')),
    );
    expect(value).toEqual(['a', 'b']);
  });

  it('decodes an empty string value', () => {
    const value = unwrapOk(parseXmlPlist(plist('<dict><key>s</key><string></string></dict>')));
    expect(value).toEqual({ s: '' });
  });

  it('returns a typed error, never throws, for a missing <plist> root', () => {
    const result = parseXmlPlist(new TextEncoder().encode('<not-a-plist/>'));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error for a dict with a dangling <key>', () => {
    const result = parseXmlPlist(plist('<dict><key>orphan</key></dict>'));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error for an unsupported element', () => {
    const result = parseXmlPlist(plist('<dict><key>x</key><weird/></dict>'));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error for invalid XML bytes', () => {
    const result = parseXmlPlist(Uint8Array.of(0xff, 0xfe, 0x00, 0x01));
    expect(result.ok).toBe(false);
  });
});

describe('parseXmlPlist property tests', () => {
  it('never throws on random bytes', () => {
    expect(() => {
      fc.assert(
        fc.property(fc.uint8Array({ maxLength: 128 }), (bytes) => {
          const result = parseXmlPlist(bytes);
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });

  it('never throws on truncated valid XML plists', () => {
    const good = plist('<dict><key>a</key><string>hello world</string></dict>');
    expect(() => {
      fc.assert(
        fc.property(fc.nat({ max: good.length }), (cutoff) => {
          const result = parseXmlPlist(good.slice(0, cutoff));
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });
});
