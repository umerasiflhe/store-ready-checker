import type { Result } from '../util/result.ts';
import { isBinaryPlist, parseBinaryPlist } from './binary.ts';
import type { PlistValue } from './types.ts';
import { parseXmlPlist } from './xml.ts';

export type { PlistDict, PlistValue } from './types.ts';
export { isPlistArray, isPlistDict } from './types.ts';
export { isBinaryPlist, parseBinaryPlist } from './binary.ts';
export { parseXmlPlist } from './xml.ts';

/** Detects bplist00 vs XML and parses accordingly. */
export function parsePlist(bytes: Uint8Array): Result<PlistValue> {
  return isBinaryPlist(bytes) ? parseBinaryPlist(bytes) : parseXmlPlist(bytes);
}
