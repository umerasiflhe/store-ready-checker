import { fromBinary } from '@bufbuild/protobuf';
import {
  BundleConfigSchema,
  UncompressNativeLibraries_PageAlignment,
} from '../gen/bundletool/config_pb.ts';
import { tryParse, type Result } from '../util/result.ts';

export interface BundleConfigFacts {
  readonly nativeLibrariesUncompressed: boolean;
  readonly nativeLibraryPageAlignment16K: boolean;
}

/** Decodes an AAB's root `BundleConfig.pb` (bundletool's own protobuf format), exposing just the
 * `AND-16K-004` fields: whether native libraries are configured uncompressed, and whether
 * bundletool was asked to 16 KB-align them. Never throws on malformed/truncated input. */
export function decodeBundleConfig(bytes: Uint8Array): Result<BundleConfigFacts> {
  return tryParse('BUNDLE_CONFIG_PARSE_FAILED', () => {
    const config = fromBinary(BundleConfigSchema, bytes);
    const uncompressNativeLibraries = config.optimizations?.uncompressNativeLibraries;
    return {
      nativeLibrariesUncompressed: uncompressNativeLibraries?.enabled ?? false,
      nativeLibraryPageAlignment16K:
        uncompressNativeLibraries?.alignment ===
        UncompressNativeLibraries_PageAlignment.PAGE_ALIGNMENT_16K,
    };
  });
}
