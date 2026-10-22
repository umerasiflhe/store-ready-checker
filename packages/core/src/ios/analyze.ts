import { parsePlist } from '../plist/index.ts';
import type { PlistValue } from '../plist/types.ts';
import type { ZipArchive } from '../zip/centralDirectory.ts';
import { type DiscoveredBundle, discoverBundles } from './bundles.ts';
import { type InfoPlistFacts, extractInfoPlistFacts } from './infoPlist.ts';
import { type MachOFacts, parseMachO } from './machO.ts';
import { type PrivacyManifestFacts, extractPrivacyManifestFacts } from './privacyManifest.ts';
import {
  type DetectedRequiredReasonUsage,
  type RequiredReasonSeed,
  detectRequiredReasonUsage,
} from './requiredReason.ts';
import { type Result } from '../util/result.ts';

export interface BundleFacts {
  readonly kind: DiscoveredBundle['kind'];
  readonly path: string;
  readonly info: InfoPlistFacts;
  readonly machO: MachOFacts | undefined;
  readonly privacyManifest: PrivacyManifestFacts | undefined;
  readonly requiredReasonUsage: readonly DetectedRequiredReasonUsage[];
}

export interface IosFacts {
  readonly bundles: readonly BundleFacts[];
}

async function readPlistAt(archive: ZipArchive, path: string): Promise<PlistValue | undefined> {
  const entry = await archive.readEntry(path);
  if (!entry.ok) {
    return undefined;
  }
  const parsed = parsePlist(entry.value);
  return parsed.ok ? parsed.value : undefined;
}

async function analyzeBundle(
  archive: ZipArchive,
  bundle: DiscoveredBundle,
  seed: RequiredReasonSeed,
): Promise<BundleFacts> {
  const infoPlist = await readPlistAt(archive, `${bundle.path}/Info.plist`);
  const info = extractInfoPlistFacts(infoPlist ?? null);

  let machO: MachOFacts | undefined;
  if (info.executableName !== undefined) {
    const executable = await archive.readEntry(`${bundle.path}/${info.executableName}`);
    if (executable.ok) {
      const parsed: Result<MachOFacts> = parseMachO(executable.value);
      if (parsed.ok) {
        machO = parsed.value;
      }
    }
  }

  const privacyPlist = await readPlistAt(archive, `${bundle.path}/PrivacyInfo.xcprivacy`);
  const privacyManifest =
    privacyPlist === undefined ? undefined : extractPrivacyManifestFacts(privacyPlist);

  const requiredReasonUsage = detectRequiredReasonUsage(
    { symbols: machO?.symbols ?? [], selectors: machO?.selectors ?? [] },
    seed,
  );

  return {
    kind: bundle.kind,
    path: bundle.path,
    info,
    machO,
    privacyManifest,
    requiredReasonUsage,
  };
}

/**
 * Discovers every bundle and gathers its facts. Assumes `archive` already contains a
 * `Payload/<Name>.app` (callers check that via `discoverBundles`/`findMainAppBundlePath` first);
 * a bundle missing an expected file just gets empty facts rather than failing the whole analysis.
 */
export async function analyzeIosBundles(
  archive: ZipArchive,
  seed: RequiredReasonSeed,
): Promise<Result<IosFacts>> {
  const discovered = discoverBundles(archive.list());
  if (!discovered.ok) {
    return discovered;
  }
  const bundles = await Promise.all(
    discovered.value.map((bundle) => analyzeBundle(archive, bundle, seed)),
  );
  return { ok: true, value: { bundles } };
}
