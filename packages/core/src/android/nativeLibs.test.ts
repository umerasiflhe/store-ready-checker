import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { BlobByteSource } from '../zip/byteSource.ts';
import { ZipArchive } from '../zip/centralDirectory.ts';
import { collectNativeLibs } from './nativeLibs.ts';

function minimalElf64(phNum = 0): Uint8Array {
  const header = new Uint8Array(64);
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 2; // ELFCLASS64
  header[5] = 1; // ELFDATA2LSB
  header[56] = phNum & 0xff;
  return header;
}

interface ZipEntryInput {
  readonly name: string;
  readonly data: Uint8Array;
  readonly stored?: boolean;
}

async function buildZip(entries: readonly ZipEntryInput[]): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { useWebWorkers: false });
  for (const entry of entries) {
    await zip.add(
      entry.name,
      new Uint8ArrayReader(entry.data),
      entry.stored ? { compressionMethod: 0 } : {},
    );
  }
  await zip.close();
  return writer.getData();
}

describe('collectNativeLibs', () => {
  it('finds .so entries at the APK root and under an AAB module prefix, with their ABI', async () => {
    const blob = await buildZip([
      { name: 'lib/arm64-v8a/libfoo.so', data: minimalElf64(), stored: true },
      { name: 'base/lib/x86_64/libbar.so', data: minimalElf64(), stored: true },
      { name: 'AndroidManifest.xml', data: new Uint8Array([1, 2, 3]) },
    ]);
    const archive = await ZipArchive.open(new BlobByteSource(blob));
    if (!archive.ok) throw new Error('failed to open test zip');

    const facts = await collectNativeLibs(archive.value, undefined);
    expect(facts.libraries.map((lib) => [lib.path, lib.abi]).sort()).toEqual([
      ['base/lib/x86_64/libbar.so', 'x86_64'],
      ['lib/arm64-v8a/libfoo.so', 'arm64-v8a'],
    ]);
    expect(facts.libraries.every((lib) => lib.elf !== undefined)).toBe(true);
    await archive.value.close();
  });

  it('leaves elf undefined for an unparseable .so without throwing', async () => {
    const blob = await buildZip([
      { name: 'lib/arm64-v8a/libfoo.so', data: new Uint8Array([1, 2, 3]) },
    ]);
    const archive = await ZipArchive.open(new BlobByteSource(blob));
    if (!archive.ok) throw new Error('failed to open test zip');

    const facts = await collectNativeLibs(archive.value, undefined);
    expect(facts.libraries[0]?.elf).toBeUndefined();
    await archive.value.close();
  });

  it('computes stored/zip-data-offset only when a source is provided', async () => {
    const blob = await buildZip([
      { name: 'lib/arm64-v8a/stored.so', data: minimalElf64(), stored: true },
      { name: 'lib/arm64-v8a/compressed.so', data: new Uint8Array(200).fill(7), stored: false },
    ]);
    const source = new BlobByteSource(blob);
    const archive = await ZipArchive.open(source);
    if (!archive.ok) throw new Error('failed to open test zip');

    const withoutSource = await collectNativeLibs(archive.value, undefined);
    expect(withoutSource.libraries.every((lib) => lib.stored === undefined)).toBe(true);

    const withSource = await collectNativeLibs(archive.value, source);
    const stored = withSource.libraries.find((lib) => lib.path.endsWith('stored.so'));
    const compressed = withSource.libraries.find((lib) => lib.path.endsWith('compressed.so'));
    expect(stored?.stored).toBe(true);
    expect(stored?.zipDataOffset).toBeTypeOf('number');
    expect(compressed?.stored).toBe(false);
    expect(compressed?.zipDataOffset).toBeUndefined();
    await archive.value.close();
  });
});
