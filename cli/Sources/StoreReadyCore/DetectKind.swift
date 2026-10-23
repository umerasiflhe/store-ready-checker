/// Mirrors `apps/web/src/detectKind.ts`: file extension first (`.ipa`/`.aab`/`.apk`,
/// case-insensitive), falling back to peeking zip entries for `Payload/`, an AAB module
/// manifest, or a root `AndroidManifest.xml`. The Swift CLI's `check <file>` has no `--kind`
/// flag, so it needs this same fallback the web worker uses for an extension-less or
/// renamed upload — reimplemented fresh here since Swift can't share code with the TS side,
/// not shared, but kept behaviorally identical.
public enum DetectedKind: String, Sendable {
  case ipa
  case aab
  case apk
}

private nonisolated(unsafe) let aabModuleManifestPeekRegex =
  /^[^\/]+\/manifest\/AndroidManifest\.xml$/

public func detectKind(fileName: String, entries: [ZipEntry]) -> DetectedKind? {
  let lower = fileName.lowercased()
  if lower.hasSuffix(".ipa") { return .ipa }
  if lower.hasSuffix(".aab") { return .aab }
  if lower.hasSuffix(".apk") { return .apk }

  if entries.contains(where: { $0.filename.hasPrefix("Payload/") }) { return .ipa }
  if entries.contains(where: {
    (try? aabModuleManifestPeekRegex.wholeMatch(in: $0.filename)) != nil
  }) {
    return .aab
  }
  if entries.contains(where: { $0.filename == "AndroidManifest.xml" }) { return .apk }
  return nil
}
