import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Result } from '../util/result.ts';
import { BlobByteSource } from './byteSource.ts';
import { ZipArchive } from './centralDirectory.ts';

async function buildZip(entries: Record<string, string>): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    await zip.add(name, new TextReader(content));
  }
  await zip.close();
  return writer.getData();
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got error: ${result.error.code} ${result.error.message}`);
  }
  return result.value;
}

describe('ZipArchive', () => {
  it('lists entries and reads their content back', async () => {
    const blob = await buildZip({
      'Payload/MyApp.app/Info.plist': 'info',
      'Payload/MyApp.app/MyApp': 'binary-ish',
    });
    const archive = unwrap(await ZipArchive.open(new BlobByteSource(blob)));

    const names = archive.list().map((entry) => entry.filename);
    expect(names.sort()).toEqual(['Payload/MyApp.app/Info.plist', 'Payload/MyApp.app/MyApp']);

    const content = unwrap(await archive.readEntry('Payload/MyApp.app/Info.plist'));
    expect(new TextDecoder().decode(content)).toBe('info');

    await archive.close();
  });

  it('fails with a typed error for a missing entry', async () => {
    const blob = await buildZip({ 'a.txt': 'a' });
    const archive = unwrap(await ZipArchive.open(new BlobByteSource(blob)));

    const read = await archive.readEntry('missing.txt');
    expect(read).toEqual({
      ok: false,
      error: { code: 'ENTRY_NOT_FOUND', message: 'entry not found: missing.txt' },
    });
    await archive.close();
  });

  it('fails with a typed error (not a thrown exception) on non-zip bytes', async () => {
    const blob = new Blob([Uint8Array.from([1, 2, 3, 4, 5])]);
    const opened = await ZipArchive.open(new BlobByteSource(blob));
    expect(opened.ok).toBe(false);
    expect(opened.ok ? undefined : opened.error.code).toBe('NOT_A_ZIP');
  });

  it('fails with a typed error on an empty file', async () => {
    const opened = await ZipArchive.open(new BlobByteSource(new Blob([])));
    expect(opened).toEqual({
      ok: false,
      error: { code: 'EMPTY_FILE', message: 'the file is empty' },
    });
  });

  it('never throws on random bytes — always returns a Result', async () => {
    await expect(
      fc.assert(
        fc.asyncProperty(fc.uint8Array({ maxLength: 256 }), async (bytes) => {
          const opened = await ZipArchive.open(new BlobByteSource(new Blob([bytes])));
          return typeof opened.ok === 'boolean';
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
