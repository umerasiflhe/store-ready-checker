import { describe, expect, it } from 'vitest';
import { parsePlist } from './index.ts';

describe('parsePlist', () => {
  it('dispatches XML plists to the XML parser', () => {
    const xml = new TextEncoder().encode(
      '<?xml version="1.0"?><plist version="1.0"><dict><key>a</key><string>b</string></dict></plist>',
    );
    const result = parsePlist(xml);
    expect(result).toEqual({ ok: true, value: { a: 'b' } });
  });

  it('dispatches bplist00 bytes to the binary parser', () => {
    const result = parsePlist(new TextEncoder().encode('bplist00 but otherwise garbage'));
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'BPLIST_PARSE_FAILED',
        message: 'file is too small to contain a bplist trailer',
      },
    });
  });
});
