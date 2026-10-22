import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isBinaryPlist, parseBinaryPlist } from './binary.ts';

// --- Minimal bplist00 encoder, test-only. Mirrors the layout in
// .claude/skills/ipa-analysis/reference.md so this test exercises the real decoder against a
// real (if hand-built) binary plist, including the "fill byte" long-count path. ---

interface Real {
  readonly real: number;
}
interface Utf16 {
  readonly utf16: string;
}
interface NodeDict {
  readonly [key: string]: Node;
}
type Node = null | boolean | number | Real | Date | Uint8Array | string | Utf16 | Node[] | NodeDict;

interface InternedArray {
  readonly kind: 'array';
  readonly items: number[];
}
interface InternedDict {
  readonly kind: 'dict';
  readonly pairs: [number, number][];
}
type InternedObject = InternedArray | InternedDict | { readonly kind: 'leaf'; readonly node: Node };

const OBJECT_REF_SIZE = 2;
const OFFSET_INT_SIZE = 4;
const MACOS_EPOCH_MS = Date.UTC(2001, 0, 1);

function isReal(node: Node): node is Real {
  return typeof node === 'object' && node !== null && 'real' in node;
}
function isUtf16(node: Node): node is Utf16 {
  return typeof node === 'object' && node !== null && 'utf16' in node;
}
function isPlainDict(node: Node): node is NodeDict {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    !(node instanceof Date) &&
    !(node instanceof Uint8Array) &&
    !isReal(node) &&
    !isUtf16(node)
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function bigUint(value: bigint, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let remaining = value;
  for (let i = size - 1; i >= 0; i -= 1) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function encodeCount(prefix: number, count: number): Uint8Array {
  if (count < 0x0f) {
    return Uint8Array.of(prefix | count);
  }
  return concat([Uint8Array.of(prefix | 0x0f, 0x12), bigUint(BigInt(count), 4)]);
}

function encodeRefs(indices: readonly number[]): Uint8Array {
  return concat(indices.map((index) => bigUint(BigInt(index), OBJECT_REF_SIZE)));
}

/** Flattens a JS object graph into a flat bplist object table (no de-duplication; not needed for tests). */
function flatten(root: Node): { objects: InternedObject[]; rootIndex: number } {
  const objects: InternedObject[] = [];

  function push(entry: InternedObject): number {
    const index = objects.length;
    objects.push(entry);
    return index;
  }

  function intern(node: Node): number {
    if (Array.isArray(node)) {
      const items = node.map(intern);
      return push({ kind: 'array', items });
    }
    if (isPlainDict(node)) {
      const pairs: [number, number][] = Object.entries(node).map(([key, value]) => [
        intern(key),
        intern(value),
      ]);
      return push({ kind: 'dict', pairs });
    }
    return push({ kind: 'leaf', node });
  }

  const rootIndex = intern(root);
  return { objects, rootIndex };
}

function encodeLeaf(node: Node): Uint8Array {
  if (node === null) return Uint8Array.of(0x00);
  if (node === false) return Uint8Array.of(0x08);
  if (node === true) return Uint8Array.of(0x09);
  if (node instanceof Date) {
    const seconds = (node.getTime() - MACOS_EPOCH_MS) / 1000;
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, seconds, false);
    return concat([Uint8Array.of(0x33), bytes]);
  }
  if (node instanceof Uint8Array) {
    return concat([encodeCount(0x40, node.length), node]);
  }
  if (isReal(node)) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, node.real, false);
    return concat([Uint8Array.of(0x23), bytes]);
  }
  if (typeof node === 'number') {
    return concat([Uint8Array.of(0x13), bigUint(BigInt(node) & 0xffffffffffffffffn, 8)]);
  }
  if (isUtf16(node)) {
    const units = Array.from(node.utf16, (char) => char.charCodeAt(0));
    const bytes = new Uint8Array(units.length * 2);
    const view = new DataView(bytes.buffer);
    units.forEach((unit, i) => {
      view.setUint16(i * 2, unit, false);
    });
    return concat([encodeCount(0x60, units.length), bytes]);
  }
  if (typeof node === 'string') {
    const bytes = Uint8Array.from(node, (char) => char.charCodeAt(0));
    return concat([encodeCount(0x50, bytes.length), bytes]);
  }
  throw new Error(`unsupported test node: ${JSON.stringify(node)}`);
}

function encodeBplist(root: Node): Uint8Array {
  const { objects, rootIndex } = flatten(root);
  const bodies = objects.map((entry) => {
    if (entry.kind === 'array') {
      return concat([encodeCount(0xa0, entry.items.length), encodeRefs(entry.items)]);
    }
    if (entry.kind === 'dict') {
      return concat([
        encodeCount(0xd0, entry.pairs.length),
        encodeRefs(entry.pairs.map(([key]) => key)),
        encodeRefs(entry.pairs.map(([, value]) => value)),
      ]);
    }
    return encodeLeaf(entry.node);
  });

  const offsetTable: number[] = [];
  let cursor = 8;
  for (const body of bodies) {
    offsetTable.push(cursor);
    cursor += body.length;
  }
  const offsetTableOffset = cursor;

  const trailer = new Uint8Array(32);
  const trailerView = new DataView(trailer.buffer);
  trailer[6] = OFFSET_INT_SIZE;
  trailer[7] = OBJECT_REF_SIZE;
  trailerView.setBigUint64(8, BigInt(objects.length), false);
  trailerView.setBigUint64(16, BigInt(rootIndex), false);
  trailerView.setBigUint64(24, BigInt(offsetTableOffset), false);

  return concat([
    new TextEncoder().encode('bplist00'),
    ...bodies,
    ...offsetTable.map((offset) => bigUint(BigInt(offset), OFFSET_INT_SIZE)),
    trailer,
  ]);
}

function unwrapOk<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

describe('isBinaryPlist', () => {
  it('recognizes the bplist00 magic', () => {
    expect(isBinaryPlist(new TextEncoder().encode('bplist00rest'))).toBe(true);
  });

  it('rejects anything else, including short buffers', () => {
    expect(isBinaryPlist(new TextEncoder().encode('<?xml versio'))).toBe(false);
    expect(isBinaryPlist(Uint8Array.of(1, 2, 3))).toBe(false);
  });
});

describe('parseBinaryPlist', () => {
  it('decodes every scalar type', () => {
    const value = unwrapOk(
      parseBinaryPlist(
        encodeBplist({
          n: null,
          t: true,
          f: false,
          i: -5,
          r: { real: 1.5 },
          d: new Date('2026-01-02T03:04:05.000Z'),
          data: Uint8Array.of(1, 2, 3),
          ascii: 'hi',
          wide: { utf16: 'héllo' },
        }),
      ),
    );
    expect(value).toEqual({
      n: null,
      t: true,
      f: false,
      i: -5,
      r: 1.5,
      d: new Date('2026-01-02T03:04:05.000Z'),
      data: Uint8Array.of(1, 2, 3),
      ascii: 'hi',
      wide: 'héllo',
    });
  });

  it('decodes nested arrays and dicts', () => {
    const value = unwrapOk(parseBinaryPlist(encodeBplist({ list: [1, 2, { inner: 'x' }] })));
    expect(value).toEqual({ list: [1, 2, { inner: 'x' }] });
  });

  it('decodes a long string via the fill-byte count path', () => {
    const long = 'a'.repeat(40);
    const value = unwrapOk(parseBinaryPlist(encodeBplist({ s: long })));
    expect(value).toEqual({ s: long });
  });

  it('decodes an array long enough to need the fill-byte count path', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const value = unwrapOk(parseBinaryPlist(encodeBplist({ items })));
    expect(value).toEqual({ items });
  });

  it('returns a typed error, never throws, for truncated or malformed input', () => {
    const good = encodeBplist({ ok: true });
    const result = parseBinaryPlist(good.slice(0, good.length - 10));
    expect(result.ok).toBe(false);
  });

  it('returns a typed error for a buffer missing the magic', () => {
    const result = parseBinaryPlist(new TextEncoder().encode('not a plist'));
    expect(result).toEqual({
      ok: false,
      error: { code: 'BPLIST_PARSE_FAILED', message: 'missing bplist00 magic' },
    });
  });
});

describe('parseBinaryPlist property tests', () => {
  it('never throws on random or truncated bytes', () => {
    expect(() => {
      fc.assert(
        fc.property(fc.uint8Array({ maxLength: 128 }), (bytes) => {
          const result = parseBinaryPlist(bytes);
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });

  it('never throws on a truncated valid bplist', () => {
    const good = encodeBplist({ a: 1, b: [1, 2, 3], c: { d: 'hello world' } });
    expect(() => {
      fc.assert(
        fc.property(fc.nat({ max: good.length }), (cutoff) => {
          const result = parseBinaryPlist(good.slice(0, cutoff));
          return typeof result.ok === 'boolean';
        }),
      );
    }).not.toThrow();
  });
});
