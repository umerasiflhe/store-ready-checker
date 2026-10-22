export interface PlistDict {
  [key: string]: PlistValue;
}

export type PlistValue =
  null | boolean | number | string | Uint8Array | Date | PlistValue[] | PlistDict;

export function isPlistDict(value: PlistValue | undefined): value is PlistDict {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

export function isPlistArray(value: PlistValue | undefined): value is PlistValue[] {
  return Array.isArray(value);
}
