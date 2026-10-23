/// Mirrors `packages/core/src/ios/analyze.ts`.

public struct BundleFacts: Sendable {
  public let kind: BundleKind
  public let path: String
  public let info: InfoPlistFacts
  public let machO: MachOFacts?
  public let privacyManifest: PrivacyManifestFacts?
  public let requiredReasonUsage: [DetectedRequiredReasonUsage]
}

public struct IosFacts: Sendable {
  public let bundles: [BundleFacts]
}

/// Mirrors `readPlistAt`: a missing entry or a plist that fails to decode are both "absent" —
/// never surfaced as an error (design decision 5 in the Milestone 4 plan).
private func readPlistAt(_ archive: ZipArchive, _ path: String) -> PlistValue? {
  guard case .success(let bytes) = archive.readEntry(path) else { return nil }
  guard case .success(let value) = parsePlist(bytes) else { return nil }
  return value
}

private func analyzeBundle(
  _ archive: ZipArchive,
  _ bundle: DiscoveredBundle,
  seed: RequiredReasonSeed
) -> BundleFacts {
  let infoPlist = readPlistAt(archive, "\(bundle.path)/Info.plist")
  let info = extractInfoPlistFacts(infoPlist)

  var machO: MachOFacts?
  if let executableName = info.executableName {
    if case .success(let executable) = archive.readEntry("\(bundle.path)/\(executableName)") {
      if case .success(let parsed) = parseMachO(executable) {
        machO = parsed
      }
    }
  }

  let privacyPlist = readPlistAt(archive, "\(bundle.path)/PrivacyInfo.xcprivacy")
  let privacyManifest = privacyPlist.map(extractPrivacyManifestFacts)

  let requiredReasonUsage =
    machO.map {
      detectRequiredReasonUsage(symbols: $0.symbols, selectors: $0.selectors, seed: seed)
    }
    ?? []

  return BundleFacts(
    kind: bundle.kind,
    path: bundle.path,
    info: info,
    machO: machO,
    privacyManifest: privacyManifest,
    requiredReasonUsage: requiredReasonUsage
  )
}

public func analyzeIosBundles(
  _ archive: ZipArchive,
  seed: RequiredReasonSeed
) -> Result<IosFacts, ParseError> {
  switch discoverBundles(archive.list()) {
  case .failure(let error):
    return .failure(error)
  case .success(let discovered):
    let bundles = discovered.map { analyzeBundle(archive, $0, seed: seed) }
    return .success(IosFacts(bundles: bundles))
  }
}
