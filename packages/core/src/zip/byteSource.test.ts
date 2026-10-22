import { describe, expect, it } from 'vitest';
import { BlobByteSource } from './byteSource.ts';

describe('BlobByteSource', () => {
  it('exposes size, slice, and the underlying blob', async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4, 5);
    const source = new BlobByteSource(new Blob([bytes]));

    expect(source.size).toBe(5);
    expect(source.toBlob().size).toBe(5);
    expect(Array.from(await source.slice(1, 3))).toEqual([2, 3]);
  });
});
