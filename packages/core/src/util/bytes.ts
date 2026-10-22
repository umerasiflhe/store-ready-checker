export class OutOfBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfBoundsError';
  }
}

/**
 * Stateful cursor over a byte array. Every read throws {@link OutOfBoundsError} on truncated
 * input rather than returning garbage; callers at the parser boundary catch it (see
 * `util/result.ts#tryParse`) so malformed/truncated input never escapes as an uncaught exception.
 */
export class ByteReader {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = offset;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  seek(offset: number): void {
    this.offset = offset;
  }

  private ensure(length: number): void {
    if (length < 0 || this.offset < 0 || this.offset + length > this.bytes.length) {
      throw new OutOfBoundsError(
        `attempted to read ${String(length)} bytes at offset ${String(this.offset)} of ${String(this.bytes.length)}`,
      );
    }
  }

  readUint8(): number {
    this.ensure(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16LE(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint16BE(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  readUint32LE(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUint32BE(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readUint64LE(): bigint {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readUint64BE(): bigint {
    this.ensure(8);
    const value = this.view.getBigUint64(this.offset, false);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  skip(length: number): void {
    this.ensure(length);
    this.offset += length;
  }

  /** Reads a NUL-terminated ASCII string starting at the current offset, advancing past the NUL. */
  readCString(): string {
    const start = this.offset;
    let end = start;
    while (end < this.bytes.length && this.bytes[end] !== 0) {
      end += 1;
    }
    if (end >= this.bytes.length) {
      throw new OutOfBoundsError(`unterminated C string starting at offset ${String(start)}`);
    }
    this.offset = end + 1;
    return cStringAt(this.bytes, start);
  }
}

/** Reads a NUL-terminated (or buffer-terminated) ASCII string at `offset` without a reader. */
export function cStringAt(bytes: Uint8Array, offset: number): string {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) {
    end += 1;
  }
  let result = '';
  for (const byte of bytes.subarray(offset, end)) {
    result += String.fromCharCode(byte);
  }
  return result;
}
