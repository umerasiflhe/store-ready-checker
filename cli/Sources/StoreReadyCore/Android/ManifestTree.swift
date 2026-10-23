/// The shared manifest-tree shape both the AAB protobuf decoder (`AabManifest.swift`) and the
/// APK binary-XML decoder (`Axml.swift`) produce, so `Manifest.swift` can read either uniformly.
/// Mirrors the `RawElement`/`RawAttribute`/`AttributeValue` types implicit in
/// `packages/core/src/android/manifest.ts`.

public enum AttributeValue: Sendable {
  case string(String)
  case int(Int)
  case boolean(Bool)
}

public struct RawAttribute: Sendable {
  public let name: String
  /// `nil` when there's no known resource ID (e.g. the `package` attribute).
  public let resourceId: UInt32?
  public let value: AttributeValue

  public init(name: String, resourceId: UInt32?, value: AttributeValue) {
    self.name = name
    self.resourceId = resourceId
    self.value = value
  }
}

public struct RawElement: Sendable {
  public let name: String
  public let attributes: [RawAttribute]
  public let children: [RawElement]

  public init(name: String, attributes: [RawAttribute], children: [RawElement]) {
    self.name = name
    self.attributes = attributes
    self.children = children
  }
}
