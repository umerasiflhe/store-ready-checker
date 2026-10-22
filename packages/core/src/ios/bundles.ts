import { type Result, err, ok, parseError } from '../util/result.ts';
import type { ZipEntry } from '../zip/centralDirectory.ts';

export type BundleKind = 'app' | 'appex' | 'appclip' | 'watchapp' | 'framework' | 'bundle';

export interface DiscoveredBundle {
  readonly kind: BundleKind;
  readonly path: string;
}

const BUNDLE_SUFFIXES = ['.app', '.appex', '.framework', '.bundle'];

/** Finds the main app bundle, e.g. `Payload/MyApp.app`, from an entry whose path starts with it. */
export function findMainAppBundlePath(entries: readonly ZipEntry[]): Result<string> {
  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    const match = /^Payload\/([^/]+\.app)\//.exec(entry.filename);
    const name = match?.[1];
    if (name !== undefined) {
      return ok(`Payload/${name}`);
    }
  }
  return err(parseError('NO_PAYLOAD', 'no Payload/<Name>.app/ entry found in the archive'));
}

/** Every path prefix of `filename` that ends in a bundle-like suffix (`.app`, `.appex`, etc). */
function bundlePathsIn(filename: string): string[] {
  const segments = filename.split('/');
  const paths: string[] = [];
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    if (BUNDLE_SUFFIXES.some((suffix) => segment.endsWith(suffix))) {
      paths.push(prefix);
    }
  }
  return paths;
}

function classify(path: string, mainAppPath: string): BundleKind | undefined {
  if (path === mainAppPath) {
    return 'app';
  }
  if (path.endsWith('.appex')) {
    return 'appex';
  }
  if (path.endsWith('.framework')) {
    return 'framework';
  }
  if (path.endsWith('.bundle')) {
    return 'bundle';
  }
  if (path.endsWith('.app')) {
    if (path.startsWith(`${mainAppPath}/AppClips/`)) {
      return 'appclip';
    }
    if (path.startsWith(`${mainAppPath}/Watch/`)) {
      return 'watchapp';
    }
  }
  return undefined;
}

function comparePaths(a: DiscoveredBundle, b: DiscoveredBundle): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

/**
 * Discovers every bundle to inspect per the brief: the main app, every app extension, App Clip,
 * watch app, framework, and resource bundle — anywhere they appear in the archive.
 */
export function discoverBundles(entries: readonly ZipEntry[]): Result<readonly DiscoveredBundle[]> {
  const main = findMainAppBundlePath(entries);
  if (!main.ok) {
    return main;
  }

  const seen = new Set<string>();
  const bundles: DiscoveredBundle[] = [];
  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    for (const path of bundlePathsIn(entry.filename)) {
      if (seen.has(path)) {
        continue;
      }
      const kind = classify(path, main.value);
      if (kind === undefined) {
        continue;
      }
      seen.add(path);
      bundles.push({ kind, path });
    }
  }
  return ok(bundles.sort(comparePaths));
}
