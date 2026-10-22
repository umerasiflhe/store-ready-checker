import type { AndroidInputKind } from '@store-ready/core';

export type InputKind = 'ipa' | AndroidInputKind;

/** Extension first, falling back to peeking zip entries when it's missing or unrecognized. Pulled
 * out of worker.ts so it's unit-testable without a Worker/`self` global. */
export function detectKind(
  fileName: string,
  entries: readonly { readonly filename: string }[],
): InputKind | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ipa')) return 'ipa';
  if (lower.endsWith('.aab')) return 'aab';
  if (lower.endsWith('.apk')) return 'apk';

  if (entries.some((entry) => entry.filename.startsWith('Payload/'))) return 'ipa';
  if (entries.some((entry) => /^[^/]+\/manifest\/AndroidManifest\.xml$/.exec(entry.filename))) {
    return 'aab';
  }
  if (entries.some((entry) => entry.filename === 'AndroidManifest.xml')) return 'apk';
  return undefined;
}
