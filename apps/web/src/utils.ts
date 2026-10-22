/** Today's date in the browser's local time zone, as `YYYY-MM-DD` (brief §3.3: the rules engine's
 * default "as of" date is "today in the user's local time zone", not UTC). */
export function todayLocalDate(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex] ?? 'GB'}`;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const MIME_BY_KIND: Record<'ipa' | 'aab' | 'apk', string> = {
  ipa: 'application/octet-stream',
  aab: 'application/octet-stream',
  apk: 'application/vnd.android.package-archive',
};

/** Decodes a bundled base64 sample into a `Blob` — never a network request. */
export function sampleToBlob(base64: string, kind: 'ipa' | 'aab' | 'apk'): Blob {
  return new Blob([base64ToBytes(base64)], { type: MIME_BY_KIND[kind] });
}
