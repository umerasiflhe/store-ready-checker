/// Mirrors `packages/core/src/android/analyze.ts`: top-level AAB/APK orchestration.

public enum AndroidInputKind: String, Sendable {
  case aab
  case apk
}

public struct ModuleFacts: Sendable {
  public let name: String
  public let manifest: ManifestFacts
}

public struct AndroidFacts: Sendable {
  public let kind: AndroidInputKind
  public let modules: [ModuleFacts]
  public let nativeLibs: NativeLibsFacts
  /// AAB only, and only when `BundleConfig.pb` existed and decoded successfully.
  public let bundleConfig: BundleConfigFacts?
}

/// `"base"` if present, else whichever module was discovered first (zip central-directory
/// order) — this module's manifest governs app-wide facts like `targetSdkVersion`.
public func primaryModule(_ facts: AndroidFacts) -> ModuleFacts? {
  facts.modules.first { $0.name == "base" } ?? facts.modules.first
}

private nonisolated(unsafe) let aabModuleManifestRegex =
  /^([^\/]+)\/manifest\/AndroidManifest\.xml$/

private func analyzeAabModules(_ archive: ZipArchive) -> [ModuleFacts] {
  var modules: [ModuleFacts] = []
  for entry in archive.list() {
    guard let match = try? aabModuleManifestRegex.wholeMatch(in: entry.filename) else { continue }
    guard case .success(let bytes) = archive.readEntry(entry.filename) else { continue }
    guard case .success(let decoded) = decodeAabManifest(bytes) else { continue }
    modules.append(ModuleFacts(name: String(match.1), manifest: extractManifestFacts(decoded)))
  }
  return modules
}

private func analyzeApkModule(_ archive: ZipArchive) -> [ModuleFacts] {
  guard case .success(let bytes) = archive.readEntry("AndroidManifest.xml") else { return [] }
  guard case .success(let decoded) = decodeApkManifest(bytes) else { return [] }
  return [ModuleFacts(name: "base", manifest: extractManifestFacts(decoded))]
}

public func analyzeAndroidBundle(
  _ archive: ZipArchive,
  kind: AndroidInputKind
) -> Result<AndroidFacts, ParseError> {
  let modules = kind == .aab ? analyzeAabModules(archive) : analyzeApkModule(archive)
  if modules.isEmpty {
    return .failure(
      ParseError(code: "NO_MANIFEST", message: "no AndroidManifest.xml found in the archive")
    )
  }

  let nativeLibs = collectNativeLibs(archive, inspectZipAlignment: kind == .apk)

  var bundleConfig: BundleConfigFacts?
  if kind == .aab, case .success(let bytes) = archive.readEntry("BundleConfig.pb") {
    if case .success(let decoded) = decodeBundleConfig(bytes) {
      bundleConfig = decoded
    }
  }

  return .success(
    AndroidFacts(kind: kind, modules: modules, nativeLibs: nativeLibs, bundleConfig: bundleConfig)
  )
}
