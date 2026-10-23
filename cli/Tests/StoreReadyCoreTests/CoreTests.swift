import Foundation
import Testing

@testable import StoreReadyCore

private func loadRulesFile() -> RulesFile {
  let json = loadRulesJSON("rules.json")
  let data = try! JSONEncoder().encode(json)
  return try! JSONDecoder().decode(RulesFile.self, from: data)
}

private func loadIosSeeds() -> IosCheckSeeds {
  guard case .success(let listedSdks) = parseListedSdksSeed(loadRulesJSON("apple-listed-sdks.json"))
  else { fatalError("expected the listed-sdks seed to parse") }
  guard
    case .success(let requiredReasonApis) = parseRequiredReasonSeed(
      loadRulesJSON("apple-required-reason-apis.json")
    )
  else { fatalError("expected the required-reason seed to parse") }
  return IosCheckSeeds(listedSdks: listedSdks, requiredReasonApis: requiredReasonApis)
}

/// Normalizes a parsed-JSON report by zeroing `tool.version` — the same normalization brief
/// §7.4 specifies for `scripts/conformance.ts` (both implementations' own version strings will
/// legitimately differ).
private func normalized(_ value: JSONValue) -> JSONValue {
  guard case .object(var object) = value else { return value }
  if case .object(var tool)? = object["tool"] {
    tool["version"] = .string("")
    object["tool"] = .object(tool)
  }
  return .object(object)
}

private func loadGoldenValue(_ name: String) -> JSONValue {
  let url = repoRoot().appendingPathComponent("fixtures/expected/\(name).json")
  let data = try! Data(contentsOf: url)
  let envelope = try! JSONDecoder().decode(JSONValue.self, from: data)
  guard case .object(let object) = envelope, let value = object["value"] else {
    fatalError("\(name) is not an \"ok: true\" golden fixture")
  }
  return normalized(value)
}

private func asJSONValue(_ report: Report) -> JSONValue {
  let data = try! JSONEncoder().encode(report)
  return normalized(try! JSONDecoder().decode(JSONValue.self, from: data))
}

@Test func analyzeIpaMatchesTheGoldenReportForEveryIosFixture() throws {
  let rulesFile = loadRulesFile()
  let seeds = loadIosSeeds()
  let fixtures = [
    "ios-passing-app", "ios-binary-plist", "ios-encrypted-binary", "ios-fat-binary",
    "ios-old-minos", "ios-old-xcode", "ios-appex-old-sdk", "ios-priv-001-missing-manifest",
    "ios-priv-002-missing-category", "ios-priv-003-bad-reason-code",
    "ios-priv-003-malformed-manifest", "ios-priv-004-listed-sdk-no-manifest",
    "ios-priv-004-listed-sdk-with-manifest",
  ]
  for name in fixtures {
    let result = analyzeIpa(
      url: fixtureURL("\(name).ipa"),
      options: AnalyzeIpaOptions(
        fileName: "\(name).ipa",
        asOf: "2026-10-20",
        toolVersion: ToolInfo.version,
        rules: rulesFile,
        requiredReasonApis: seeds.requiredReasonApis,
        listedSdks: seeds.listedSdks
      )
    )
    guard case .success(let report) = result else {
      Issue.record("[\(name)] expected analyzeIpa to succeed")
      continue
    }
    #expect(asJSONValue(report) == loadGoldenValue(name), "[\(name)] full report mismatch")
  }
}

@Test func analyzeAabAndApkMatchTheGoldenReportForEveryAndroidFixture() throws {
  let rulesFile = loadRulesFile()
  let aabFixtures = [
    "android-aab-16k-bundleconfig-missing-flag", "android-aab-16k-relro-exempt",
    "android-aab-16k-relro-misaligned", "android-aab-64bit-missing",
    "android-aab-missing-uses-sdk", "android-aab-passing", "android-aab-tsdk-low",
    "android-aab-tsdk-preview", "android-aab-tsdk-tv", "android-aab-tsdk-wear",
  ]
  for name in aabFixtures {
    let result = analyzeAab(
      url: fixtureURL("\(name).aab"),
      options: AnalyzeAndroidOptions(
        fileName: "\(name).aab",
        asOf: "2026-10-20",
        toolVersion: ToolInfo.version,
        rules: rulesFile
      )
    )
    guard case .success(let report) = result else {
      Issue.record("[\(name)] expected analyzeAab to succeed")
      continue
    }
    #expect(asJSONValue(report) == loadGoldenValue(name), "[\(name)] full report mismatch")
  }

  let apkFixtures = [
    "android-apk-passing", "android-apk-zip-compressed-skipped", "android-apk-zip-misaligned",
  ]
  for name in apkFixtures {
    let result = analyzeApk(
      url: fixtureURL("\(name).apk"),
      options: AnalyzeAndroidOptions(
        fileName: "\(name).apk",
        asOf: "2026-10-20",
        toolVersion: ToolInfo.version,
        rules: rulesFile
      )
    )
    guard case .success(let report) = result else {
      Issue.record("[\(name)] expected analyzeApk to succeed")
      continue
    }
    #expect(asJSONValue(report) == loadGoldenValue(name), "[\(name)] full report mismatch")
  }
}

@Test func analyzeAabMatchesBothSidesOfThe16KBoundary() throws {
  let rulesFile = loadRulesFile()
  let before = analyzeAab(
    url: fixtureURL("android-aab-16k-load-misaligned.aab"),
    options: AnalyzeAndroidOptions(
      fileName: "android-aab-16k-load-misaligned.aab",
      asOf: "2026-10-20",
      toolVersion: ToolInfo.version,
      rules: rulesFile
    )
  )
  guard case .success(let beforeReport) = before else {
    Issue.record("expected analyzeAab to succeed")
    return
  }
  #expect(
    asJSONValue(beforeReport) == loadGoldenValue("android-aab-16k-load-misaligned-warning")
  )

  let after = analyzeAab(
    url: fixtureURL("android-aab-16k-load-misaligned.aab"),
    options: AnalyzeAndroidOptions(
      fileName: "android-aab-16k-load-misaligned.aab",
      asOf: "2027-02-01",
      toolVersion: ToolInfo.version,
      rules: rulesFile
    )
  )
  guard case .success(let afterReport) = after else {
    Issue.record("expected analyzeAab to succeed")
    return
  }
  #expect(asJSONValue(afterReport) == loadGoldenValue("android-aab-16k-load-misaligned-error"))
}

@Test func analyzeIpaFailsWithTypedErrorsForBadInput() {
  let seeds = loadIosSeeds()
  let rulesFile = loadRulesFile()
  let options = AnalyzeIpaOptions(
    fileName: "x.ipa",
    asOf: "2026-10-20",
    toolVersion: ToolInfo.version,
    rules: rulesFile,
    requiredReasonApis: seeds.requiredReasonApis,
    listedSdks: seeds.listedSdks
  )

  let notAZip = analyzeIpa(url: fixtureURL("ios-not-a-zip.ipa"), options: options)
  guard case .failure(let notAZipError) = notAZip else {
    Issue.record("expected a failure")
    return
  }
  #expect(notAZipError.code == "NOT_A_ZIP")

  let noPayload = analyzeIpa(url: fixtureURL("ios-no-payload.ipa"), options: options)
  guard case .failure(let noPayloadError) = noPayload else {
    Issue.record("expected a failure")
    return
  }
  #expect(noPayloadError.code == "NO_PAYLOAD")
}

@Test func detectKindUsesExtensionFirst() {
  #expect(detectKind(fileName: "MyApp.IPA", entries: []) == .ipa)
  #expect(detectKind(fileName: "app.aab", entries: []) == .aab)
  #expect(detectKind(fileName: "app.apk", entries: []) == .apk)
}

@Test func detectKindPeeksEntriesWhenExtensionIsMissing() {
  let ipaEntries = [
    ZipEntry(
      filename: "Payload/MyApp.app/Info.plist", isDirectory: false, compressedSize: 0,
      uncompressedSize: 0, localHeaderOffset: 0)
  ]
  #expect(detectKind(fileName: "upload.bin", entries: ipaEntries) == .ipa)

  let aabEntries = [
    ZipEntry(
      filename: "base/manifest/AndroidManifest.xml", isDirectory: false, compressedSize: 0,
      uncompressedSize: 0, localHeaderOffset: 0)
  ]
  #expect(detectKind(fileName: "upload.bin", entries: aabEntries) == .aab)

  let apkEntries = [
    ZipEntry(
      filename: "AndroidManifest.xml", isDirectory: false, compressedSize: 0, uncompressedSize: 0,
      localHeaderOffset: 0)
  ]
  #expect(detectKind(fileName: "upload.bin", entries: apkEntries) == .apk)

  #expect(
    detectKind(
      fileName: "readme.txt",
      entries: [
        .init(
          filename: "README.md", isDirectory: false, compressedSize: 0, uncompressedSize: 0,
          localHeaderOffset: 0)
      ]) == nil)
}
