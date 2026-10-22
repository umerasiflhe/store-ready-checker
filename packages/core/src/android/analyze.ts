import type { ByteSource } from '../zip/byteSource.ts';
import type { ZipArchive } from '../zip/centralDirectory.ts';
import { decodeAabManifest } from './aabManifest.ts';
import { decodeApkManifest } from './axml.ts';
import { decodeBundleConfig, type BundleConfigFacts } from './bundleConfig.ts';
import { extractManifestFacts, type ManifestFacts } from './manifest.ts';
import { collectNativeLibs, type NativeLibsFacts } from './nativeLibs.ts';
import { err, ok, parseError, type Result } from '../util/result.ts';

export interface ModuleFacts {
  readonly name: string;
  readonly manifest: ManifestFacts;
}

export type AndroidInputKind = 'aab' | 'apk';

export interface AndroidFacts {
  readonly kind: AndroidInputKind;
  readonly modules: readonly ModuleFacts[];
  readonly nativeLibs: NativeLibsFacts;
  readonly bundleConfig: BundleConfigFacts | undefined;
}

/** The module whose manifest governs app-wide facts (targetSdkVersion, form factor): `base` if
 * present, otherwise the first module discovered. */
export function primaryModule(facts: AndroidFacts): ModuleFacts | undefined {
  return facts.modules.find((module) => module.name === 'base') ?? facts.modules.at(0);
}

const AAB_MODULE_MANIFEST = /^([^/]+)\/manifest\/AndroidManifest\.xml$/;

async function analyzeAabModules(archive: ZipArchive): Promise<ModuleFacts[]> {
  const modules: ModuleFacts[] = [];
  for (const entry of archive.list()) {
    const match = AAB_MODULE_MANIFEST.exec(entry.filename);
    const name = match?.[1];
    if (!name) continue;
    const bytes = await archive.readEntry(entry.filename);
    if (!bytes.ok) continue;
    const decoded = decodeAabManifest(bytes.value);
    if (!decoded.ok) continue;
    modules.push({ name, manifest: extractManifestFacts(decoded.value) });
  }
  return modules;
}

async function analyzeApkModule(archive: ZipArchive): Promise<ModuleFacts[]> {
  const bytes = await archive.readEntry('AndroidManifest.xml');
  if (!bytes.ok) return [];
  const decoded = decodeApkManifest(bytes.value);
  if (!decoded.ok) return [];
  return [{ name: 'base', manifest: extractManifestFacts(decoded.value) }];
}

/**
 * Discovers every module's manifest (AAB: `<module>/manifest/AndroidManifest.xml`; APK: the
 * single root `AndroidManifest.xml`), every native library anywhere in the archive, and (AAB
 * only) the root `BundleConfig.pb`. A module whose manifest can't be decoded is skipped rather
 * than failing the whole analysis — mirrors `analyzeIosBundles`.
 */
export async function analyzeAndroidBundle(
  archive: ZipArchive,
  source: ByteSource,
  kind: AndroidInputKind,
): Promise<Result<AndroidFacts>> {
  const modules =
    kind === 'aab' ? await analyzeAabModules(archive) : await analyzeApkModule(archive);
  if (modules.length === 0) {
    return err(parseError('NO_MANIFEST', 'no AndroidManifest.xml found in the archive'));
  }

  const nativeLibs = await collectNativeLibs(archive, kind === 'apk' ? source : undefined);

  let bundleConfig: BundleConfigFacts | undefined;
  if (kind === 'aab') {
    const bundleConfigBytes = await archive.readEntry('BundleConfig.pb');
    if (bundleConfigBytes.ok) {
      const decoded = decodeBundleConfig(bundleConfigBytes.value);
      bundleConfig = decoded.ok ? decoded.value : undefined;
    }
  }

  return ok({ kind, modules, nativeLibs, bundleConfig });
}
