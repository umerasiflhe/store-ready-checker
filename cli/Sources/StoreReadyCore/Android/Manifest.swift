/// Mirrors `packages/core/src/android/manifest.ts`: extracts `ManifestFacts` from a `RawElement`
/// tree, regardless of whether it came from the AAB protobuf decoder or the APK AXML decoder —
/// the shared abstraction both `Analyze.swift`'s module discovery and the `AND-*` rule checks
/// read through.

private let resIdName: UInt32 = 0x0101_0003
private let resIdMinSdkVersion: UInt32 = 0x0101_020c
private let resIdVersionCode: UInt32 = 0x0101_021b
private let resIdVersionName: UInt32 = 0x0101_021c
private let resIdTargetSdkVersion: UInt32 = 0x0101_0270

public enum TargetSdkVersion: Sendable, Equatable {
  case released(Int)
  case preview(String)
}

public struct ManifestFacts: Sendable {
  public let packageName: String?
  public let versionCode: Int?
  public let versionName: String?
  public let minSdkVersion: Int
  public let targetSdkVersion: TargetSdkVersion
  /// `true` when `<uses-sdk>` or its `targetSdkVersion` attribute was missing and the value
  /// below was defaulted rather than read — flagged rather than silently assumed.
  public let targetSdkAssumed: Bool
  public let usesFeatures: [String]
}

private func findAttribute(
  _ element: RawElement,
  _ resourceId: UInt32,
  _ name: String
) -> RawAttribute? {
  if let byId = element.attributes.first(where: { $0.resourceId == resourceId }) {
    return byId
  }
  return element.attributes.first { $0.resourceId == nil && $0.name == name }
}

private func stringValue(_ attribute: RawAttribute?) -> String? {
  guard let attribute else { return nil }
  switch attribute.value {
  case .string(let value): return value
  case .int(let value): return String(value)
  case .boolean: return nil
  }
}

private func intValue(_ attribute: RawAttribute?) -> Int? {
  guard let attribute else { return nil }
  switch attribute.value {
  case .int(let value): return value
  case .string(let value):
    return value.allSatisfy(\.isNumber) && !value.isEmpty ? Int(value) : nil
  case .boolean: return nil
  }
}

private func parseTargetSdk(
  _ attribute: RawAttribute?,
  minSdkVersion: Int
) -> (TargetSdkVersion, Bool) {
  guard let attribute else { return (.released(minSdkVersion), true) }
  if let intVal = intValue(attribute) { return (.released(intVal), false) }
  if let stringVal = stringValue(attribute) { return (.preview(stringVal), false) }
  return (.released(minSdkVersion), true)
}

public func extractManifestFacts(_ manifest: RawElement) -> ManifestFacts {
  let packageName = stringValue(
    manifest.attributes.first { $0.resourceId == nil && $0.name == "package" }
  )
  let versionCode = intValue(findAttribute(manifest, resIdVersionCode, "versionCode"))
  let versionName = stringValue(findAttribute(manifest, resIdVersionName, "versionName"))

  let usesSdk = manifest.children.first { $0.name == "uses-sdk" }
  let minSdkVersion =
    usesSdk.flatMap { intValue(findAttribute($0, resIdMinSdkVersion, "minSdkVersion")) } ?? 1
  let (targetSdkVersion, targetSdkAssumed) = parseTargetSdk(
    usesSdk.flatMap { findAttribute($0, resIdTargetSdkVersion, "targetSdkVersion") },
    minSdkVersion: minSdkVersion
  )

  let usesFeatures = manifest.children
    .filter { $0.name == "uses-feature" }
    .compactMap { stringValue(findAttribute($0, resIdName, "name")) }

  return ManifestFacts(
    packageName: packageName,
    versionCode: versionCode,
    versionName: versionName,
    minSdkVersion: minSdkVersion,
    targetSdkVersion: targetSdkVersion,
    targetSdkAssumed: targetSdkAssumed,
    usesFeatures: usesFeatures
  )
}
