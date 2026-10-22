import { BlobReader, ZipReader, type Entry } from '@zip.js/zip.js';
import { type Result, parseError, tryParseAsync } from '../util/result.ts';
import type { ByteSource } from './byteSource.ts';

export interface ZipEntry {
  readonly filename: string;
  readonly directory: boolean;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  /** Offset of this entry's local file header in the archive (ADR 0002). */
  readonly offset: number;
}

function toZipEntry(entry: Entry): ZipEntry {
  return {
    filename: entry.filename,
    directory: entry.directory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    offset: entry.offset,
  };
}

/**
 * An opened zip archive: reads the central directory once (per ADR 0002), then lets callers
 * extract only the entries they need.
 */
export class ZipArchive {
  private readonly reader: ZipReader<unknown>;
  private readonly rawEntries: readonly Entry[];

  private constructor(reader: ZipReader<unknown>, rawEntries: readonly Entry[]) {
    this.reader = reader;
    this.rawEntries = rawEntries;
  }

  static async open(source: ByteSource): Promise<Result<ZipArchive>> {
    if (source.size === 0) {
      return { ok: false, error: parseError('EMPTY_FILE', 'the file is empty') };
    }
    return tryParseAsync('NOT_A_ZIP', async () => {
      const reader = new ZipReader(new BlobReader(source.toBlob()), { useWebWorkers: false });
      const rawEntries = await reader.getEntries();
      return new ZipArchive(reader, rawEntries);
    });
  }

  list(): ZipEntry[] {
    return this.rawEntries.filter((entry) => !entry.directory).map(toZipEntry);
  }

  async readEntry(filename: string): Promise<Result<Uint8Array>> {
    const entry = this.rawEntries.find((candidate) => candidate.filename === filename);
    if (!entry || entry.directory) {
      return { ok: false, error: parseError('ENTRY_NOT_FOUND', `entry not found: ${filename}`) };
    }
    return tryParseAsync('EXTRACT_FAILED', async () => {
      const buffer = await entry.arrayBuffer();
      return new Uint8Array(buffer);
    });
  }

  async close(): Promise<void> {
    await this.reader.close();
  }
}
