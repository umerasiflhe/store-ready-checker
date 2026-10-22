import { type Result, tryParse } from '../util/result.ts';

export interface ListedSdksSeed {
  readonly frameworks: readonly string[];
}

/** Parses `rules/apple-listed-sdks.json`. Never throws on malformed data. */
export function parseListedSdksSeed(data: unknown): Result<ListedSdksSeed> {
  return tryParse('LISTED_SDKS_SEED_INVALID', () => {
    const record =
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined;
    const frameworks = record?.frameworks;
    if (!Array.isArray(frameworks) || !frameworks.every((name) => typeof name === 'string')) {
      throw new Error('expected a "frameworks" array of strings');
    }
    return { frameworks };
  });
}

/** Extracts `Alamofire` from a framework bundle path like `Payload/MyApp.app/.../Alamofire.framework`. */
export function frameworkNameOf(bundlePath: string): string | undefined {
  const last = bundlePath.split('/').at(-1);
  return last?.endsWith('.framework') ? last.slice(0, -'.framework'.length) : undefined;
}

export function isListedSdk(frameworkName: string, seed: ListedSdksSeed): boolean {
  return seed.frameworks.includes(frameworkName);
}
