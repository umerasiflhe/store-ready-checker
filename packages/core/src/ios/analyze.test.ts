import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { BlobByteSource } from '../zip/byteSource.ts';
import { ZipArchive } from '../zip/centralDirectory.ts';
import { analyzeIosBundles } from './analyze.ts';
import { parseRequiredReasonSeed } from './requiredReason.ts';

async function buildZip(entries: Record<string, string | Uint8Array>): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    const reader =
      typeof content === 'string' ? new TextReader(content) : new Uint8ArrayReader(content);
    await zip.add(name, reader);
  }
  await zip.close();
  return writer.getData();
}

// Minimal thin Mach-O: header only, no load commands (facts come back all-empty, which is
// enough to exercise the analyze.ts wiring without duplicating machO.test.ts's byte-layout work).
function minimalMachO(): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xfeedfacf, true);
  view.setUint32(4, 0x0100000c, true); // CPU_TYPE_ARM64
  return bytes;
}

const SEED = parseRequiredReasonSeed({
  categories: [
    {
      type: 'NSPrivacyAccessedAPICategoryUserDefaults',
      reasonCodes: ['CA92.1'],
      evidence: { symbols: ['_OBJC_CLASS_$_NSUserDefaults'], selectors: [] },
    },
  ],
});
if (!SEED.ok) throw new Error('seed fixture is invalid');

function unwrapOk<T>(result: { ok: boolean; value?: T; error?: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value as T;
}

const INFO_PLIST = `<?xml version="1.0"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.example.app</string>
  <key>CFBundleExecutable</key><string>MyApp</string>
</dict></plist>`;

const PRIVACY_MANIFEST = `<?xml version="1.0"?>
<plist version="1.0"><dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
  </array>
</dict></plist>`;

describe('analyzeIosBundles', () => {
  it('assembles facts for the main app bundle end to end', async () => {
    const blob = await buildZip({
      'Payload/MyApp.app/Info.plist': INFO_PLIST,
      'Payload/MyApp.app/MyApp': minimalMachO(),
      'Payload/MyApp.app/PrivacyInfo.xcprivacy': PRIVACY_MANIFEST,
    });
    const archive = unwrapOk(await ZipArchive.open(new BlobByteSource(blob)));
    const facts = unwrapOk(await analyzeIosBundles(archive, SEED.value));

    expect(facts.bundles).toHaveLength(1);
    const app = facts.bundles[0];
    expect(app?.kind).toBe('app');
    expect(app?.info.bundleIdentifier).toBe('com.example.app');
    expect(app?.machO?.encrypted).toBe(false);
    expect(app?.privacyManifest?.malformed).toBe(false);
    expect(app?.privacyManifest?.accessedApiTypes).toEqual([
      { category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] },
    ]);

    await archive.close();
  });

  it('leaves machO and privacyManifest undefined when the files are absent', async () => {
    const blob = await buildZip({ 'Payload/MyApp.app/Info.plist': INFO_PLIST });
    const archive = unwrapOk(await ZipArchive.open(new BlobByteSource(blob)));
    const facts = unwrapOk(await analyzeIosBundles(archive, SEED.value));

    expect(facts.bundles[0]?.machO).toBeUndefined();
    expect(facts.bundles[0]?.privacyManifest).toBeUndefined();
    expect(facts.bundles[0]?.requiredReasonUsage).toEqual([]);

    await archive.close();
  });

  it('propagates NO_PAYLOAD when there is no main app bundle', async () => {
    const blob = await buildZip({ 'README.txt': 'hi' });
    const archive = unwrapOk(await ZipArchive.open(new BlobByteSource(blob)));
    const result = await analyzeIosBundles(archive, SEED.value);
    expect(result.ok).toBe(false);
    await archive.close();
  });
});
