// Generates every synthetic Android (.aab/.apk) fixture listed in docs/BUILD_BRIEF.md §7.1. Run
// with `npx tsx fixtures/generators/android.ts`. See the `make-fixture` skill for the conventions
// this script follows (deterministic output, no real app binaries).
import { BlobByteSource } from '../../packages/core/src/zip/byteSource.ts';
import { ZipArchive } from '../../packages/core/src/zip/centralDirectory.ts';
import { writeFixtureFile } from '../helpers/loadFixture.ts';
import { buildAabManifest, type AndroidManifestOptions } from './androidManifest.ts';
import { buildApkManifest } from './axml.ts';
import { buildBundleConfig } from './bundleConfig.ts';
import { buildElf64, type ProgramHeaderInput } from './elf.ts';
import { buildZip, type ZipEntryInput } from './zip.ts';

const CLEAN_MANIFEST: AndroidManifestOptions = {
  packageName: 'com.example.app',
  versionCode: 1,
  versionName: '1.0',
  usesSdk: { minSdkVersion: 24, targetSdkVersion: 36 },
};

const ALIGNED_LOAD: ProgramHeaderInput = { pVAddr: 0, pMemSz: 0x1000, pAlign: 16384 };
const PT_GNU_RELRO = 0x6474e552;
const PAGE_SIZE_16K = 16384;

async function writeFixture(name: string, entries: readonly ZipEntryInput[]): Promise<void> {
  writeFixtureFile(name, await buildZip(entries));
}

/** The real zip *data* offset (local-header offset + header + filename + extra field — the same
 * computation `android/nativeLibs.ts#readLocalHeader` does, since that's what `AND-16K-003`
 * actually checks) zip.js assigns `targetName` once `entries` is actually built. Measured via the
 * same `ZipArchive`/`ByteSource` the product code uses, rather than assumed, since zip.js's exact
 * per-entry overhead (extra fields, etc.) isn't part of its public contract. */
async function measureDataOffset(
  entries: readonly ZipEntryInput[],
  targetName: string,
): Promise<number> {
  const bytes = await buildZip(entries);
  const source = new BlobByteSource(new Blob([new Uint8Array(bytes)]));
  const archive = await ZipArchive.open(source);
  if (!archive.ok) throw new Error('alignment probe: failed to open the trial zip');
  const entry = archive.value.list().find((candidate) => candidate.filename === targetName);
  if (!entry) {
    await archive.value.close();
    throw new Error(`alignment probe: ${targetName} not found in the trial zip`);
  }
  const header = await source.slice(entry.offset, entry.offset + 30);
  await archive.value.close();
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const fileNameLength = view.getUint16(26, true);
  const extraFieldLength = view.getUint16(28, true);
  return entry.offset + 30 + fileNameLength + extraFieldLength;
}

/**
 * Computes a stored padding entry's byte length so that `targetEntry`, placed right after it,
 * lands on a zip *data* offset (not local-header offset) that's a multiple of `alignment`.
 * Measures the real offset with a reference 1-byte pad (zip.js adds a one-time extra-field for a
 * *zero*-length stored entry, so probing at exactly 0 would skew the extrapolation) and
 * extrapolates from there: stored data beyond that point is appended byte-for-byte, so the offset
 * increases 1:1 with the pad length. Always returns at least 1, never 0, to stay clear of that
 * same zero-length case.
 */
async function computeAlignmentPadding(
  priorEntries: readonly ZipEntryInput[],
  targetEntry: ZipEntryInput,
  padName: string,
  alignment: number,
): Promise<number> {
  const referencePad = 1;
  const probeEntries = [
    ...priorEntries,
    { name: padName, data: new Uint8Array(referencePad), stored: true },
    targetEntry,
  ];
  const offsetAtReferencePad = await measureDataOffset(probeEntries, targetEntry.name);
  const baseOffset = offsetAtReferencePad - referencePad;
  const remainder = baseOffset % alignment;
  return remainder === 0 ? alignment : alignment - remainder;
}

// --- AAB fixtures ---

function aabManifestEntry(
  module: string,
  manifest: AndroidManifestOptions = CLEAN_MANIFEST,
): ZipEntryInput {
  return { name: `${module}/manifest/AndroidManifest.xml`, data: buildAabManifest(manifest) };
}

function aabNativeLib(
  module: string,
  abi: string,
  programHeaders: readonly ProgramHeaderInput[],
): ZipEntryInput {
  return { name: `${module}/lib/${abi}/libnative.so`, data: buildElf64(programHeaders) };
}

async function generatePassing(): Promise<void> {
  await writeFixture('android-aab-passing.aab', [aabManifestEntry('base')]);
}

async function generateTsdkLow(): Promise<void> {
  await writeFixture('android-aab-tsdk-low.aab', [
    aabManifestEntry('base', {
      ...CLEAN_MANIFEST,
      usesSdk: { minSdkVersion: 24, targetSdkVersion: 30 },
    }),
  ]);
}

async function generateTsdkWear(): Promise<void> {
  await writeFixture('android-aab-tsdk-wear.aab', [
    aabManifestEntry('base', {
      ...CLEAN_MANIFEST,
      usesSdk: { minSdkVersion: 24, targetSdkVersion: 34 },
      usesFeatures: ['android.hardware.type.watch'],
    }),
  ]);
}

async function generateTsdkTv(): Promise<void> {
  await writeFixture('android-aab-tsdk-tv.aab', [
    aabManifestEntry('base', {
      ...CLEAN_MANIFEST,
      usesSdk: { minSdkVersion: 24, targetSdkVersion: 33 },
      usesFeatures: ['android.software.leanback'],
    }),
  ]);
}

async function generateTsdkPreview(): Promise<void> {
  await writeFixture('android-aab-tsdk-preview.aab', [
    aabManifestEntry('base', {
      ...CLEAN_MANIFEST,
      usesSdk: { minSdkVersion: 24, targetSdkVersion: { codename: 'Baklava' } },
    }),
  ]);
}

async function generateMissingUsesSdk(): Promise<void> {
  await writeFixture('android-aab-missing-uses-sdk.aab', [
    aabManifestEntry('base', {
      packageName: 'com.example.app',
      versionCode: 1,
      versionName: '1.0',
    }),
  ]);
}

async function generate16kLoadMisaligned(): Promise<void> {
  await writeFixture('android-aab-16k-load-misaligned.aab', [
    aabManifestEntry('base'),
    aabNativeLib('base', 'arm64-v8a', [{ pVAddr: 0, pMemSz: 0x1000, pAlign: 4096 }]),
  ]);
}

/** Same misaligned library in a TV and a Wear OS app, for their earlier 16 KB dates. */
async function generate16kFormFactorMisaligned(): Promise<void> {
  const misaligned = aabNativeLib('base', 'arm64-v8a', [
    { pVAddr: 0, pMemSz: 0x1000, pAlign: 4096 },
  ]);
  await writeFixture('android-aab-16k-tv-misaligned.aab', [
    aabManifestEntry('base', { ...CLEAN_MANIFEST, usesFeatures: ['android.software.leanback'] }),
    misaligned,
  ]);
  await writeFixture('android-aab-16k-wear-misaligned.aab', [
    aabManifestEntry('base', { ...CLEAN_MANIFEST, usesFeatures: ['android.hardware.type.watch'] }),
    misaligned,
  ]);
}

async function generate16kRelroMisaligned(): Promise<void> {
  await writeFixture('android-aab-16k-relro-misaligned.aab', [
    aabManifestEntry('base'),
    aabNativeLib('base', 'arm64-v8a', [
      ALIGNED_LOAD,
      { pType: PT_GNU_RELRO, pVAddr: 0x1000, pMemSz: 0x2500, pAlign: 1 },
    ]),
  ]);
}

async function generate16kRelroExempt(): Promise<void> {
  await writeFixture('android-aab-16k-relro-exempt.aab', [
    aabManifestEntry('base'),
    aabNativeLib('base', 'arm64-v8a', [
      { pVAddr: 0x1000, pMemSz: 0x2500, pAlign: 16384 },
      { pType: PT_GNU_RELRO, pVAddr: 0x1000, pMemSz: 0x2500, pAlign: 1 },
    ]),
  ]);
}

async function generate16kBundleConfigMissingFlag(): Promise<void> {
  await writeFixture('android-aab-16k-bundleconfig-missing-flag.aab', [
    aabManifestEntry('base'),
    aabNativeLib('base', 'arm64-v8a', [ALIGNED_LOAD]),
    {
      name: 'BundleConfig.pb',
      data: buildBundleConfig({ nativeLibrariesUncompressed: true, pageAlignment16K: false }),
    },
  ]);
}

async function generate64BitMissing(): Promise<void> {
  await writeFixture('android-aab-64bit-missing.aab', [
    aabManifestEntry('base'),
    aabNativeLib('base', 'armeabi-v7a', [ALIGNED_LOAD]),
  ]);
}

async function generateMalformedManifest(): Promise<void> {
  await writeFixture('android-aab-malformed-manifest.aab', [
    { name: 'base/manifest/AndroidManifest.xml', data: new Uint8Array([0xff, 0xff, 0xff]) },
  ]);
}

// --- APK fixtures ---

function apkManifestEntry(manifest: AndroidManifestOptions = CLEAN_MANIFEST): ZipEntryInput {
  return { name: 'AndroidManifest.xml', data: buildApkManifest(manifest), stored: true };
}

function apkNativeLib(
  abi: string,
  programHeaders: readonly ProgramHeaderInput[],
  stored: boolean,
): ZipEntryInput {
  return { name: `lib/${abi}/libnative.so`, data: buildElf64(programHeaders), stored };
}

async function generateApkPassing(): Promise<void> {
  const manifest = apkManifestEntry();
  const lib = apkNativeLib('arm64-v8a', [ALIGNED_LOAD], true);
  const padLength = await computeAlignmentPadding([manifest], lib, 'assets/pad.bin', PAGE_SIZE_16K);
  const pad: ZipEntryInput = {
    name: 'assets/pad.bin',
    data: new Uint8Array(padLength),
    stored: true,
  };
  await writeFixture('android-apk-passing.apk', [manifest, pad, lib]);
}

async function generateApkZipMisaligned(): Promise<void> {
  // No alignment padding: a small zip's natural local-header offset is never a multiple of
  // 16384, so this stored library is misaligned without any special setup.
  await writeFixture('android-apk-zip-misaligned.apk', [
    apkManifestEntry(),
    apkNativeLib('arm64-v8a', [ALIGNED_LOAD], true),
  ]);
}

async function generateApkZipCompressedSkipped(): Promise<void> {
  // Same natural (non-16384-aligned) offset as above, but stored: false — AND-16K-003 only
  // applies to stored entries, so this must produce no finding.
  await writeFixture('android-apk-zip-compressed-skipped.apk', [
    apkManifestEntry(),
    apkNativeLib('arm64-v8a', [ALIGNED_LOAD], false),
  ]);
}

function generateApkNotAZip(): void {
  writeFixtureFile('android-apk-not-a-zip.apk', new TextEncoder().encode('not a zip file\n'));
}

async function generateApkNoManifest(): Promise<void> {
  await writeFixture('android-apk-no-manifest.apk', [
    { name: 'README.txt', data: 'no AndroidManifest.xml in this archive\n' },
  ]);
}

async function main(): Promise<void> {
  await generatePassing();
  await generateTsdkLow();
  await generateTsdkWear();
  await generateTsdkTv();
  await generateTsdkPreview();
  await generateMissingUsesSdk();
  await generate16kLoadMisaligned();
  await generate16kFormFactorMisaligned();
  await generate16kRelroMisaligned();
  await generate16kRelroExempt();
  await generate16kBundleConfigMissingFlag();
  await generate64BitMissing();
  await generateMalformedManifest();
  await generateApkPassing();
  await generateApkZipMisaligned();
  await generateApkZipCompressedSkipped();
  generateApkNotAZip();
  await generateApkNoManifest();
}

await main();
