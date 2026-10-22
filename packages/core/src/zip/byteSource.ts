/**
 * Random-access byte source. Backed by `Blob` (global in both browsers and Node >=24), so the
 * same implementation works inside a Web Worker and under Node for tests — per ADR 0002, nothing
 * here ever buffers a whole multi-gigabyte archive in memory.
 */
export interface ByteSource {
  readonly size: number;
  slice(start: number, end: number): Promise<Uint8Array>;
  /** The underlying Blob, for APIs (like zip.js's `BlobReader`) that need it directly. */
  toBlob(): Blob;
}

export class BlobByteSource implements ByteSource {
  private readonly blob: Blob;

  constructor(blob: Blob) {
    this.blob = blob;
  }

  get size(): number {
    return this.blob.size;
  }

  async slice(start: number, end: number): Promise<Uint8Array> {
    const buffer = await this.blob.slice(start, end).arrayBuffer();
    return new Uint8Array(buffer);
  }

  toBlob(): Blob {
    return this.blob;
  }
}
