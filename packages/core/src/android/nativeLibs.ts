import type { ByteSource } from '../zip/byteSource.ts';
import type { ZipArchive, ZipEntry } from '../zip/centralDirectory.ts';
import { parseElf, type ElfFacts } from './elf.ts';

const NATIVE_LIB_PATH = /lib\/([^/]+)\/[^/]+\.so$/;
const ZIP_COMPRESSION_STORED = 0;

export interface NativeLibFacts {
  readonly path: string;
  readonly abi: string;
  readonly elf: ElfFacts | undefined;
  /** Whether this zip entry is stored uncompressed. `undefined` when zip-local-header details
   * weren't requested (AAB native libs — `AND-16K-003` is APK-only). */
  readonly stored: boolean | undefined;
  /** The entry's file-data byte offset in the archive, for the zip-alignment check. Only set
   * when `stored` is `true`. */
  readonly zipDataOffset: number | undefined;
}

export interface NativeLibsFacts {
  readonly libraries: readonly NativeLibFacts[];
}

async function readLocalHeader(
  source: ByteSource,
  entry: ZipEntry,
): Promise<{ readonly compression: number; readonly dataOffset: number }> {
  const header = await source.slice(entry.offset, entry.offset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const compression = view.getUint16(8, true);
  const fileNameLength = view.getUint16(26, true);
  const extraFieldLength = view.getUint16(28, true);
  return { compression, dataOffset: entry.offset + 30 + fileNameLength + extraFieldLength };
}

/** Finds every `lib/<abi>/*.so` entry anywhere in the archive (AAB: under each module's prefix;
 * APK: at the zip root) and parses its ELF program headers. Pass `source` to also compute each
 * entry's stored/zip-data-offset facts (`AND-16K-003`, APK only). */
export async function collectNativeLibs(
  archive: ZipArchive,
  source: ByteSource | undefined,
): Promise<NativeLibsFacts> {
  const entries = archive.list().filter((entry) => NATIVE_LIB_PATH.test(entry.filename));
  const libraries: NativeLibFacts[] = [];
  for (const entry of entries) {
    const abi = NATIVE_LIB_PATH.exec(entry.filename)?.[1] ?? 'unknown';
    const bytes = await archive.readEntry(entry.filename);
    const elf = bytes.ok ? parseElf(bytes.value) : undefined;

    let stored: boolean | undefined;
    let zipDataOffset: number | undefined;
    if (source) {
      const local = await readLocalHeader(source, entry);
      stored = local.compression === ZIP_COMPRESSION_STORED;
      zipDataOffset = stored ? local.dataOffset : undefined;
    }

    libraries.push({
      path: entry.filename,
      abi,
      elf: elf?.ok ? elf.value : undefined,
      stored,
      zipDataOffset,
    });
  }
  return { libraries };
}
