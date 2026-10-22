import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';

// Fixed so every generator run produces byte-identical zips (make-fixture skill: "fixed
// timestamps on every zip entry, stable entry order, no randomness").
const DETERMINISTIC_DATE = new Date('1980-01-01T00:00:00Z');

export interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array | string;
  /** `true` to store uncompressed (needed for zip-alignment checks in Milestone 2). */
  readonly stored?: boolean;
}

export async function buildZip(entries: readonly ZipEntryInput[]): Promise<Uint8Array> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, {
    useWebWorkers: false,
    lastModDate: DETERMINISTIC_DATE,
    extendedTimestamp: false,
  });
  for (const entry of entries) {
    const reader =
      typeof entry.data === 'string'
        ? new TextReader(entry.data)
        : new Uint8ArrayReader(entry.data);
    await zip.add(entry.name, reader, entry.stored === true ? { compressionMethod: 0 } : {});
  }
  await zip.close();
  const blob = await writer.getData();
  return new Uint8Array(await blob.arrayBuffer());
}
