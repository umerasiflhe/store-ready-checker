// Builds a synthetic AAB BundleConfig.pb (bundletool's own protobuf format; make-fixture skill:
// never a real bundletool output).
import { create, toBinary } from '@bufbuild/protobuf';
import {
  BundleConfigSchema,
  UncompressNativeLibraries_PageAlignment,
} from '../../packages/core/src/gen/bundletool/config_pb.ts';

export interface BundleConfigOptions {
  readonly nativeLibrariesUncompressed: boolean;
  readonly pageAlignment16K: boolean;
}

export function buildBundleConfig(options: BundleConfigOptions): Uint8Array {
  const config = create(BundleConfigSchema, {
    optimizations: {
      uncompressNativeLibraries: {
        enabled: options.nativeLibrariesUncompressed,
        alignment: options.pageAlignment16K
          ? UncompressNativeLibraries_PageAlignment.PAGE_ALIGNMENT_16K
          : UncompressNativeLibraries_PageAlignment.PAGE_ALIGNMENT_4K,
      },
    },
  });
  return toBinary(BundleConfigSchema, config);
}
