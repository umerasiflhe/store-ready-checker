import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { parsePlist } from '../plist/index.ts';
import { BlobByteSource } from '../zip/byteSource.ts';
import { ZipArchive } from '../zip/centralDirectory.ts';
import { discoverBundles, findMainAppBundlePath } from './bundles.ts';

async function buildZip(entries: Record<string, string>): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    await zip.add(name, new TextReader(content));
  }
  await zip.close();
  return writer.getData();
}

const INFO_PLIST = `<?xml version="1.0"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.app</string></dict></plist>`;

describe('findMainAppBundlePath', () => {
  it('finds the main app bundle from any entry under it', () => {
    const result = findMainAppBundlePath([
      {
        filename: 'Payload/MyApp.app/Info.plist',
        directory: false,
        compressedSize: 0,
        uncompressedSize: 0,
        offset: 0,
      },
    ]);
    expect(result).toEqual({ ok: true, value: 'Payload/MyApp.app' });
  });

  it('returns NO_PAYLOAD when there is no Payload/*.app entry', () => {
    const result = findMainAppBundlePath([
      {
        filename: 'README.txt',
        directory: false,
        compressedSize: 0,
        uncompressedSize: 0,
        offset: 0,
      },
    ]);
    expect(result).toEqual({
      ok: false,
      error: { code: 'NO_PAYLOAD', message: 'no Payload/<Name>.app/ entry found in the archive' },
    });
  });

  it('ignores directory entries', () => {
    const result = findMainAppBundlePath([
      {
        filename: 'Payload/MyApp.app/',
        directory: true,
        compressedSize: 0,
        uncompressedSize: 0,
        offset: 0,
      },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('discoverBundles', () => {
  it('discovers the main app plus every extension, clip, watch app, framework, and resource bundle', () => {
    const entries = [
      'Payload/MyApp.app/Info.plist',
      'Payload/MyApp.app/PlugIns/Share.appex/Info.plist',
      'Payload/MyApp.app/AppClips/Clip.app/Info.plist',
      'Payload/MyApp.app/Watch/WatchApp.app/Info.plist',
      'Payload/MyApp.app/Frameworks/Alamofire.framework/Info.plist',
      'Payload/MyApp.app/Frameworks/Alamofire.framework/PrivacyInfo.xcprivacy',
      'Payload/MyApp.app/Resources.bundle/PrivacyInfo.xcprivacy',
    ].map((filename) => ({
      filename,
      directory: false,
      compressedSize: 0,
      uncompressedSize: 0,
      offset: 0,
    }));

    const result = discoverBundles(entries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { kind: 'app', path: 'Payload/MyApp.app' },
      { kind: 'appclip', path: 'Payload/MyApp.app/AppClips/Clip.app' },
      { kind: 'framework', path: 'Payload/MyApp.app/Frameworks/Alamofire.framework' },
      { kind: 'appex', path: 'Payload/MyApp.app/PlugIns/Share.appex' },
      { kind: 'bundle', path: 'Payload/MyApp.app/Resources.bundle' },
      { kind: 'watchapp', path: 'Payload/MyApp.app/Watch/WatchApp.app' },
    ]);
  });

  it('propagates NO_PAYLOAD', () => {
    const result = discoverBundles([
      {
        filename: 'README.txt',
        directory: false,
        compressedSize: 0,
        uncompressedSize: 0,
        offset: 0,
      },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('end-to-end: zip + plist + bundle discovery', () => {
  it('opens a real zip, discovers the main bundle, and reads its Info.plist facts', async () => {
    const blob = await buildZip({
      'Payload/MyApp.app/Info.plist': INFO_PLIST,
      'Payload/MyApp.app/MyApp': 'pretend-executable-bytes',
    });
    const archive = await ZipArchive.open(new BlobByteSource(blob));
    expect(archive.ok).toBe(true);
    if (!archive.ok) return;

    const bundles = discoverBundles(archive.value.list());
    expect(bundles).toEqual({ ok: true, value: [{ kind: 'app', path: 'Payload/MyApp.app' }] });
    if (!bundles.ok) return;

    const mainBundle = bundles.value.at(0);
    expect(mainBundle).toBeDefined();
    const infoPlistBytes = await archive.value.readEntry(`${mainBundle?.path ?? ''}/Info.plist`);
    expect(infoPlistBytes.ok).toBe(true);
    if (!infoPlistBytes.ok) return;

    const info = parsePlist(infoPlistBytes.value);
    expect(info).toEqual({ ok: true, value: { CFBundleIdentifier: 'com.example.app' } });

    await archive.value.close();
  });

  it('reports NOT_A_ZIP for non-zip bytes, end to end', async () => {
    const archive = await ZipArchive.open(new BlobByteSource(new Blob([Uint8Array.of(1, 2, 3)])));
    expect(archive.ok ? undefined : archive.error.code).toBe('NOT_A_ZIP');
  });

  it('reports NO_PAYLOAD for a valid zip with no Payload/ entries, end to end', async () => {
    const blob = await buildZip({ 'README.txt': 'hello' });
    const archive = await ZipArchive.open(new BlobByteSource(blob));
    expect(archive.ok).toBe(true);
    if (!archive.ok) return;

    const bundles = discoverBundles(archive.value.list());
    expect(bundles).toEqual({
      ok: false,
      error: { code: 'NO_PAYLOAD', message: 'no Payload/<Name>.app/ entry found in the archive' },
    });
    await archive.value.close();
  });
});
