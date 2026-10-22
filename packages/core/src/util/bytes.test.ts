import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ByteReader, OutOfBoundsError, cStringAt } from './bytes.ts';

describe('ByteReader', () => {
  it('reads little- and big-endian integers', () => {
    const reader = new ByteReader(Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0xff]));
    expect(reader.readUint8()).toBe(0x01);
    expect(reader.readUint16LE()).toBe(0x0302);
    expect(reader.readUint8()).toBe(0x04);
    expect(reader.readUint8()).toBe(0xff);
  });

  it('reads uint32 and uint64 in both endiannesses', () => {
    const bytes = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(new ByteReader(bytes).readUint32LE()).toBe(0x04030201);
    expect(new ByteReader(bytes).readUint32BE()).toBe(0x01020304);
    expect(new ByteReader(bytes).readUint64LE()).toBe(0x0807060504030201n);
    expect(new ByteReader(bytes).readUint64BE()).toBe(0x0102030405060708n);
  });

  it('reads a NUL-terminated C string and advances past the NUL', () => {
    const reader = new ByteReader(Uint8Array.from([104, 105, 0, 99]));
    expect(reader.readCString()).toBe('hi');
    expect(reader.readUint8()).toBe(99);
  });

  it('throws OutOfBoundsError instead of returning garbage on truncated reads', () => {
    const reader = new ByteReader(Uint8Array.from([0x01]));
    expect(() => reader.readUint32LE()).toThrow(OutOfBoundsError);
  });

  it('throws OutOfBoundsError on an unterminated C string', () => {
    const reader = new ByteReader(Uint8Array.from([104, 105]));
    expect(() => reader.readCString()).toThrow(OutOfBoundsError);
  });

  it('readBytes returns a view that does not advance past the end', () => {
    const reader = new ByteReader(Uint8Array.from([1, 2, 3, 4]));
    expect(Array.from(reader.readBytes(2))).toEqual([1, 2]);
    expect(reader.remaining).toBe(2);
  });
});

describe('cStringAt', () => {
  it('reads to the NUL terminator', () => {
    expect(cStringAt(Uint8Array.from([97, 98, 99, 0, 100]), 0)).toBe('abc');
  });

  it('reads to the end of the buffer when there is no NUL', () => {
    expect(cStringAt(Uint8Array.from([97, 98, 99]), 0)).toBe('abc');
  });
});

describe('ByteReader property tests', () => {
  it('never throws anything other than OutOfBoundsError on random bytes and offsets', () => {
    expect(() => {
      fc.assert(
        fc.property(
          fc.uint8Array({ maxLength: 64 }),
          fc.nat({ max: 80 }),
          fc.constantFrom(
            'readUint8',
            'readUint16LE',
            'readUint16BE',
            'readUint32LE',
            'readUint32BE',
            'readUint64LE',
            'readUint64BE',
            'readCString',
          ),
          (bytes, offset, method) => {
            const reader = new ByteReader(bytes, offset);
            try {
              reader[method]();
              return true;
            } catch (error) {
              return error instanceof OutOfBoundsError;
            }
          },
        ),
      );
    }).not.toThrow();
  });
});
