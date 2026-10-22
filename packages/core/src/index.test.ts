import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import listedSdksJson from '../../../rules/apple-listed-sdks.json' with { type: 'json' };
import requiredReasonApisJson from '../../../rules/apple-required-reason-apis.json' with { type: 'json' };
import rulesJson from '../../../rules/rules.json' with { type: 'json' };
import { analyzeIpa, type AnalyzeIpaOptions } from './index.ts';
import { parseListedSdksSeed } from './ios/listedSdks.ts';
import { parseRequiredReasonSeed } from './ios/requiredReason.ts';
import { parseRulesFile } from './rules/types.ts';
import { BlobByteSource } from './zip/byteSource.ts';

const rulesFileResult = parseRulesFile(rulesJson);
if (!rulesFileResult.ok) throw new Error('rules/rules.json is invalid');
const listedSdksResult = parseListedSdksSeed(listedSdksJson);
if (!listedSdksResult.ok) throw new Error('rules/apple-listed-sdks.json is invalid');
const requiredReasonApisResult = parseRequiredReasonSeed(requiredReasonApisJson);
if (!requiredReasonApisResult.ok)
  throw new Error('rules/apple-required-reason-apis.json is invalid');

const baseOptions: Omit<AnalyzeIpaOptions, 'fileName'> = {
  asOf: '2026-10-20',
  toolVersion: '0.1.0',
  rules: rulesFileResult.value,
  requiredReasonApis: requiredReasonApisResult.value,
  listedSdks: listedSdksResult.value,
};

async function buildZip(entries: Record<string, string>): Promise<Blob> {
  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer, { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    await zip.add(name, new TextReader(content));
  }
  await zip.close();
  return writer.getData();
}

function infoPlist(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
    .join('\n');
  return `<?xml version="1.0"?><plist version="1.0"><dict>${body}</dict></plist>`;
}

describe('analyzeIpa', () => {
  it('reports status "ready" for a clean app', async () => {
    const blob = await buildZip({
      'Payload/MyApp.app/Info.plist': infoPlist({
        CFBundleIdentifier: 'com.example.app',
        CFBundleShortVersionString: '2.3.0',
        CFBundleVersion: '45',
        MinimumOSVersion: '15.0',
        DTXcode: '2600',
        DTPlatformVersion: '26.0',
      }),
    });
    const result = await analyzeIpa(new BlobByteSource(blob), {
      ...baseOptions,
      fileName: 'MyApp.ipa',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary.status).toBe('ready');
    expect(result.value.app).toEqual({
      platform: 'ios',
      id: 'com.example.app',
      version: '2.3.0',
      build: '45',
    });
    expect(result.value.input).toEqual({
      fileName: 'MyApp.ipa',
      sizeBytes: blob.size,
      kind: 'ipa',
    });
    expect(result.value.tool).toEqual({
      name: 'store-ready',
      version: '0.1.0',
      rulesVersion: rulesJson.rulesVersion,
    });
  });

  it('reports status "blocked" with an IOS-SDK-001 error for an old Xcode build', async () => {
    const blob = await buildZip({
      'Payload/MyApp.app/Info.plist': infoPlist({
        CFBundleIdentifier: 'com.example.app',
        DTXcode: '1640',
        DTSDKName: 'iphoneos18.5',
      }),
    });
    const result = await analyzeIpa(new BlobByteSource(blob), {
      ...baseOptions,
      fileName: 'MyApp.ipa',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary.status).toBe('blocked');
    expect(result.value.findings.map((f) => f.ruleId)).toContain('IOS-SDK-001');
  });

  it('returns a typed error for a non-zip file', async () => {
    const result = await analyzeIpa(new BlobByteSource(new Blob([Uint8Array.of(1, 2, 3)])), {
      ...baseOptions,
      fileName: 'not-a-zip.ipa',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('NOT_A_ZIP');
  });

  it('returns a typed error for a zip with no Payload/ directory', async () => {
    const blob = await buildZip({ 'README.txt': 'hi' });
    const result = await analyzeIpa(new BlobByteSource(blob), {
      ...baseOptions,
      fileName: 'no-payload.ipa',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('NO_PAYLOAD');
  });
});
