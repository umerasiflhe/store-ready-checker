import { type Result, tryParse } from '../util/result.ts';
import type { PlistDict, PlistValue } from './types.ts';

// Layout per .claude/skills/ipa-analysis/reference.md ("Binary plist (bplist00)"), which mirrors
// Apple's CFBinaryPlist format.
const MAGIC = 'bplist00';
const TRAILER_SIZE = 32;
const MACOS_EPOCH_MS = Date.UTC(2001, 0, 1);

export function isBinaryPlist(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length) {
    return false;
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

export function parseBinaryPlist(bytes: Uint8Array): Result<PlistValue> {
  return tryParse('BPLIST_PARSE_FAILED', () => decode(bytes));
}

function decode(bytes: Uint8Array): PlistValue {
  if (!isBinaryPlist(bytes)) {
    throw new Error('missing bplist00 magic');
  }
  if (bytes.length < MAGIC.length + TRAILER_SIZE) {
    throw new Error('file is too small to contain a bplist trailer');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailerOffset = bytes.length - TRAILER_SIZE;
  const offsetIntSize = view.getUint8(trailerOffset + 6);
  const objectRefSize = view.getUint8(trailerOffset + 7);
  const numObjects = safeNumber(view.getBigUint64(trailerOffset + 8, false));
  const topObject = safeNumber(view.getBigUint64(trailerOffset + 16, false));
  const offsetTableOffset = safeNumber(view.getBigUint64(trailerOffset + 24, false));

  if (offsetIntSize < 1 || offsetIntSize > 8 || objectRefSize < 1 || objectRefSize > 8) {
    throw new Error('invalid offsetIntSize/objectRefSize in bplist trailer');
  }

  const offsetTable: number[] = [];
  for (let i = 0; i < numObjects; i += 1) {
    offsetTable.push(readUIntBE(view, offsetTableOffset + i * offsetIntSize, offsetIntSize));
  }

  const resolved = new Map<number, PlistValue>();
  const resolving = new Set<number>();

  function resolve(ref: number): PlistValue {
    const cached = resolved.get(ref);
    if (cached !== undefined) {
      return cached;
    }
    if (ref < 0 || ref >= offsetTable.length) {
      throw new Error(`object reference ${String(ref)} is out of range`);
    }
    if (resolving.has(ref)) {
      throw new Error(`cyclic object reference at index ${String(ref)}`);
    }
    const offset = offsetTable.at(ref);
    if (offset === undefined) {
      throw new Error(`object reference ${String(ref)} is out of range`);
    }
    resolving.add(ref);
    const value = decodeObjectAt(offset);
    resolving.delete(ref);
    resolved.set(ref, value);
    return value;
  }

  function readCount(info: number, pos: number): readonly [count: number, next: number] {
    if (info !== 0x0f) {
      return [info, pos];
    }
    const sizeMarker = view.getUint8(pos);
    if (sizeMarker >> 4 !== 0x1) {
      throw new Error('expected an int object to introduce a fill-byte count');
    }
    const sizeByteCount = 1 << (sizeMarker & 0x0f);
    const size = readUIntBE(view, pos + 1, sizeByteCount);
    return [size, pos + 1 + sizeByteCount];
  }

  function decodeObjectAt(offset: number): PlistValue {
    const marker = view.getUint8(offset);
    const type = marker >> 4;
    const info = marker & 0x0f;
    const pos = offset + 1;

    switch (type) {
      case 0x0:
        if (marker === 0x00) return null;
        if (marker === 0x08) return false;
        if (marker === 0x09) return true;
        throw new Error(`unsupported singleton marker 0x${marker.toString(16)}`);
      case 0x1:
        return readIntBE(view, pos, 1 << info);
      case 0x2:
        if (info === 2) return view.getFloat32(pos, false);
        if (info === 3) return view.getFloat64(pos, false);
        throw new Error(`unsupported real size nibble 0x${info.toString(16)}`);
      case 0x3: {
        if (info !== 3) {
          throw new Error(`unsupported date size nibble 0x${info.toString(16)}`);
        }
        const seconds = view.getFloat64(pos, false);
        return new Date(MACOS_EPOCH_MS + seconds * 1000);
      }
      case 0x4: {
        const [length, dataStart] = readCount(info, pos);
        return bytes.slice(dataStart, dataStart + length);
      }
      case 0x5: {
        const [length, start] = readCount(info, pos);
        return asciiString(bytes, start, length);
      }
      case 0x6: {
        const [length, start] = readCount(info, pos);
        return new TextDecoder('utf-16be').decode(bytes.slice(start, start + length * 2));
      }
      case 0x8:
        return readUIntBE(view, pos, info + 1);
      case 0xa: {
        const [count, refsStart] = readCount(info, pos);
        const array: PlistValue[] = [];
        for (let i = 0; i < count; i += 1) {
          array.push(resolve(readUIntBE(view, refsStart + i * objectRefSize, objectRefSize)));
        }
        return array;
      }
      case 0xd: {
        const [count, refsStart] = readCount(info, pos);
        const valuesStart = refsStart + count * objectRefSize;
        const dict: PlistDict = {};
        for (let i = 0; i < count; i += 1) {
          const keyRef = readUIntBE(view, refsStart + i * objectRefSize, objectRefSize);
          const valueRef = readUIntBE(view, valuesStart + i * objectRefSize, objectRefSize);
          const key = resolve(keyRef);
          if (typeof key !== 'string') {
            throw new Error('dictionary key did not resolve to a string');
          }
          dict[key] = resolve(valueRef);
        }
        return dict;
      }
      default:
        throw new Error(`unsupported object marker 0x${marker.toString(16)}`);
    }
  }

  return resolve(topObject);
}

function asciiString(bytes: Uint8Array, start: number, length: number): string {
  let result = '';
  for (const byte of bytes.subarray(start, start + length)) {
    result += String.fromCharCode(byte);
  }
  return result;
}

function readUIntBEBig(view: DataView, offset: number, size: number): bigint {
  let value = 0n;
  for (let i = 0; i < size; i += 1) {
    value = (value << 8n) | BigInt(view.getUint8(offset + i));
  }
  return value;
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`integer ${value.toString()} cannot be represented safely`);
  }
  return Number(value);
}

function readUIntBE(view: DataView, offset: number, size: number): number {
  return safeNumber(readUIntBEBig(view, offset, size));
}

function readIntBE(view: DataView, offset: number, size: number): number {
  let value = readUIntBEBig(view, offset, size);
  const bits = BigInt(size * 8);
  const signBit = 1n << (bits - 1n);
  if (value & signBit) {
    value -= 1n << bits;
  }
  return safeNumber(value);
}
