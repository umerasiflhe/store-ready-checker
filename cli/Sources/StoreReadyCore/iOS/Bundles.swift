/// Mirrors `packages/core/src/ios/bundles.ts`. Pure path-string logic over an already-listed
/// `[ZipEntry]` — never touches zip content.

public enum BundleKind: String, Sendable {
  case app
  case appex
  case appclip
  case watchapp
  case framework
  case bundle
}

public struct DiscoveredBundle: Sendable {
  public let kind: BundleKind
  public let path: String
}

private let payloadAppPrefix = "Payload/"

public func findMainAppBundlePath(_ entries: [ZipEntry]) -> Result<String, ParseError> {
  for entry in entries where !entry.isDirectory {
    guard entry.filename.hasPrefix(payloadAppPrefix) else { continue }
    let rest = entry.filename.dropFirst(payloadAppPrefix.count)
    guard let slashIndex = rest.firstIndex(of: "/") else { continue }
    let name = rest[rest.startIndex..<slashIndex]
    guard name.hasSuffix(".app") else { continue }
    return .success(payloadAppPrefix + name)
  }
  return .failure(
    ParseError(code: "NO_PAYLOAD", message: "no Payload/<Name>.app/ entry found in the archive")
  )
}

private let bundleSuffixes = [".app", ".appex", ".framework", ".bundle"]

/// Every ancestor path segment matching a bundle suffix, not just the deepest — a file at
/// `Payload/MyApp.app/PlugIns/Ext.appex/Ext` yields both `Payload/MyApp.app` and
/// `Payload/MyApp.app/PlugIns/Ext.appex`.
private func bundlePathsIn(_ filename: String) -> [String] {
  var results: [String] = []
  var prefix = ""
  for segment in filename.split(separator: "/", omittingEmptySubsequences: false) {
    prefix = prefix.isEmpty ? String(segment) : prefix + "/" + segment
    if bundleSuffixes.contains(where: { segment.hasSuffix($0) }) {
      results.append(prefix)
    }
  }
  return results
}

private func classify(_ path: String, mainAppPath: String) -> BundleKind? {
  if path == mainAppPath { return .app }
  if path.hasSuffix(".appex") { return .appex }
  if path.hasSuffix(".framework") { return .framework }
  if path.hasSuffix(".bundle") { return .bundle }
  if path.hasSuffix(".app") {
    if path.hasPrefix(mainAppPath + "/AppClips/") { return .appclip }
    if path.hasPrefix(mainAppPath + "/Watch/") { return .watchapp }
    return nil
  }
  return nil
}

public func discoverBundles(_ entries: [ZipEntry]) -> Result<[DiscoveredBundle], ParseError> {
  let mainAppPath: String
  switch findMainAppBundlePath(entries) {
  case .success(let path): mainAppPath = path
  case .failure(let error): return .failure(error)
  }

  var seen = Set<String>()
  var bundles: [DiscoveredBundle] = []
  for entry in entries where !entry.isDirectory {
    for path in bundlePathsIn(entry.filename) where !seen.contains(path) {
      guard let kind = classify(path, mainAppPath: mainAppPath) else { continue }
      seen.insert(path)
      bundles.append(DiscoveredBundle(kind: kind, path: path))
    }
  }
  bundles.sort { $0.path < $1.path }
  return .success(bundles)
}
