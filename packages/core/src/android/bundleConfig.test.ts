import { create, toBinary } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  BundleConfigSchema,
  UncompressNativeLibraries_PageAlignment,
} from '../gen/bundletool/config_pb.ts';
import { decodeBundleConfig } from './bundleConfig.ts';

describe('decodeBundleConfig', () => {
  it('reads enabled=true and PAGE_ALIGNMENT_16K', () => {
    const config = create(BundleConfigSchema, {
      optimizations: {
        uncompressNativeLibraries: {
          enabled: true,
          alignment: UncompressNativeLibraries_PageAlignment.PAGE_ALIGNMENT_16K,
        },
      },
    });
    const result = decodeBundleConfig(toBinary(BundleConfigSchema, config));
    expect(result).toEqual({
      ok: true,
      value: { nativeLibrariesUncompressed: true, nativeLibraryPageAlignment16K: true },
    });
  });

  it('reads enabled=true with PAGE_ALIGNMENT_4K as not 16K-aligned', () => {
    const config = create(BundleConfigSchema, {
      optimizations: {
        uncompressNativeLibraries: {
          enabled: true,
          alignment: UncompressNativeLibraries_PageAlignment.PAGE_ALIGNMENT_4K,
        },
      },
    });
    const result = decodeBundleConfig(toBinary(BundleConfigSchema, config));
    expect(result).toEqual({
      ok: true,
      value: { nativeLibrariesUncompressed: true, nativeLibraryPageAlignment16K: false },
    });
  });

  it('defaults to false/false when optimizations is absent', () => {
    const config = create(BundleConfigSchema, {});
    const result = decodeBundleConfig(toBinary(BundleConfigSchema, config));
    expect(result).toEqual({
      ok: true,
      value: { nativeLibrariesUncompressed: false, nativeLibraryPageAlignment16K: false },
    });
  });

  it('returns a typed error on truncated/garbage input', () => {
    const result = decodeBundleConfig(new Uint8Array([0xff, 0xff, 0xff]));
    expect(result.ok).toBe(false);
  });
});
