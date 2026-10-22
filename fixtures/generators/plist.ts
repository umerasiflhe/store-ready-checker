// Builds both binary (bplist00) and XML property lists for fixtures, from the same plain JS
// value shape the real `parsePlist` decoder (packages/core/src/plist) would decode out of them.

export interface PlistReal {
  readonly real: number;
}
export interface PlistDictValue {
  readonly [key: string]: PlistEncodable;
}
export type PlistEncodable =
  | null
  | boolean
  | number
  | PlistReal
  | Date
  | Uint8Array
  | string
  | PlistEncodable[]
  | PlistDictValue;

function isReal(node: PlistEncodable): node is PlistReal {
  return typeof node === 'object' && node !== null && 'real' in node;
}
function isPlainDict(node: PlistEncodable): node is PlistDictValue {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    !(node instanceof Date) &&
    !(node instanceof Uint8Array) &&
    !isReal(node)
  );
}

// --- XML ---

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function xmlValue(node: PlistEncodable): string {
  if (node === null) return '<string></string>';
  if (node === true) return '<true/>';
  if (node === false) return '<false/>';
  if (node instanceof Date) return `<date>${node.toISOString()}</date>`;
  if (node instanceof Uint8Array) return `<data>${base64(node)}</data>`;
  if (isReal(node)) return `<real>${String(node.real)}</real>`;
  if (typeof node === 'number') return `<integer>${String(node)}</integer>`;
  if (typeof node === 'string') return `<string>${escapeXml(node)}</string>`;
  if (Array.isArray(node)) return `<array>\n${node.map(xmlValue).join('\n')}\n</array>`;
  const entries = Object.entries(node)
    .map(([key, value]) => `<key>${escapeXml(key)}</key>\n${xmlValue(value)}`)
    .join('\n');
  return `<dict>\n${entries}\n</dict>`;
}

export function encodeXmlPlist(value: PlistEncodable): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${xmlValue(value)}
</plist>
`;
}

// --- Binary (bplist00) ---

interface InternedArray {
  readonly kind: 'array';
  readonly items: number[];
}
interface InternedDict {
  readonly kind: 'dict';
  readonly pairs: [number, number][];
}
type InternedObject =
  InternedArray | InternedDict | { readonly kind: 'leaf'; readonly node: PlistEncodable };

const OBJECT_REF_SIZE = 2;
const OFFSET_INT_SIZE = 4;
const MACOS_EPOCH_MS = Date.UTC(2001, 0, 1);

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

function flatten(root: PlistEncodable): { objects: InternedObject[]; rootIndex: number } {
  const objects: InternedObject[] = [];

  function push(entry: InternedObject): number {
    const index = objects.length;
    objects.push(entry);
    return index;
  }

  function intern(node: PlistEncodable): number {
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

function encodeLeaf(node: PlistEncodable): Uint8Array {
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
  if (typeof node === 'string') {
    const bytes = Uint8Array.from(node, (char) => char.charCodeAt(0));
    return concat([encodeCount(0x50, bytes.length), bytes]);
  }
  throw new Error(`unsupported plist node: ${JSON.stringify(node)}`);
}

export function encodeBinaryPlist(root: PlistEncodable): Uint8Array {
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
