/// Mirrors `packages/core/src/ios/infoPlist.ts`. Pure and total — never throws, regardless of
/// what `plist` is.

public struct InfoPlistFacts: Sendable {
  public let bundleIdentifier: String?
  public let shortVersionString: String?
  public let bundleVersion: String?
  public let minimumOSVersion: String?
  public let executableName: String?
  public let dtXcode: String?
  public let dtXcodeBuild: String?
  public let dtSdkName: String?
  public let dtPlatformVersion: String?
  public let dtPlatformName: String?

  public static let empty = InfoPlistFacts(
    bundleIdentifier: nil,
    shortVersionString: nil,
    bundleVersion: nil,
    minimumOSVersion: nil,
    executableName: nil,
    dtXcode: nil,
    dtXcodeBuild: nil,
    dtSdkName: nil,
    dtPlatformVersion: nil,
    dtPlatformName: nil
  )
}

/// `DTXcode` and friends are documented as strings, but a plist integer is tolerated too (TS
/// comment, preserved here) — anything else (bool, array, dict, date, data, missing key) is
/// `nil`.
private func stringField(_ dict: [String: PlistValue], _ key: String) -> String? {
  guard let value = dict[key] else { return nil }
  if let string = value.stringValue { return string }
  if let number = value.numberValue {
    if number == number.rounded() {
      return String(Int64(number))
    }
    return String(number)
  }
  return nil
}

public func extractInfoPlistFacts(_ plist: PlistValue?) -> InfoPlistFacts {
  guard let dict = plist?.dictValue else { return .empty }
  return InfoPlistFacts(
    bundleIdentifier: stringField(dict, "CFBundleIdentifier"),
    shortVersionString: stringField(dict, "CFBundleShortVersionString"),
    bundleVersion: stringField(dict, "CFBundleVersion"),
    minimumOSVersion: stringField(dict, "MinimumOSVersion"),
    executableName: stringField(dict, "CFBundleExecutable"),
    dtXcode: stringField(dict, "DTXcode"),
    dtXcodeBuild: stringField(dict, "DTXcodeBuild"),
    dtSdkName: stringField(dict, "DTSDKName"),
    dtPlatformVersion: stringField(dict, "DTPlatformVersion"),
    dtPlatformName: stringField(dict, "DTPlatformName")
  )
}
