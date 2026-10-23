/// Mirrors `packages/core/src/android/bundleConfig.ts`: decodes bundletool's own `BundleConfig.pb`
/// (generated from `proto/bundletool/config.proto` into `Generated/bundletool/config.pb.swift`).

public struct BundleConfigFacts: Sendable {
  public let nativeLibrariesUncompressed: Bool
  public let nativeLibraryPageAlignment16K: Bool
}

public func decodeBundleConfig(_ bytes: [UInt8]) -> Result<BundleConfigFacts, ParseError> {
  tryParse("BUNDLE_CONFIG_PARSE_FAILED") {
    let config = try Android_Bundle_BundleConfig(serializedBytes: bytes)
    let uncompressNativeLibraries = config.optimizations.uncompressNativeLibraries
    let nativeLibrariesUncompressed = uncompressNativeLibraries.enabled
    let nativeLibraryPageAlignment16K = uncompressNativeLibraries.alignment == .pageAlignment16K
    return BundleConfigFacts(
      nativeLibrariesUncompressed: nativeLibrariesUncompressed,
      nativeLibraryPageAlignment16K: nativeLibraryPageAlignment16K
    )
  }
}
