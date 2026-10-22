/**
 * Compares two dotted version strings (e.g. "13.0" vs "12.4.1") segment by segment. Returns `NaN`
 * if either string contains a non-numeric segment — callers should skip evaluation in that case
 * rather than guessing.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((part) => Number(part));
  const partsB = b.split('.').map((part) => Number(part));
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const x = partsA.at(i) ?? 0;
    const y = partsB.at(i) ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NaN;
    }
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
