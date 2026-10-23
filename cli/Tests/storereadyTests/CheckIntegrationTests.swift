import Foundation
import StoreReadyCore
import Testing

/// Brief §7.3: "CLI integration tests that run the built executable on fixtures and assert exit
/// codes, `--fail-on` behaviour, and JSON output." These spawn the real `storeready` binary as a
/// subprocess — a black-box check of the actual CLI contract, on top of the library-level
/// fixture tests in `StoreReadyCoreTests/CoreTests.swift`.

private struct CLIRunResult {
  let exitCode: Int32
  let stdout: Data
  let stderr: Data
}

private func runStoreReady(_ arguments: [String]) throws -> CLIRunResult {
  let process = Process()
  process.executableURL = storeReadyExecutableURL()
  process.arguments = arguments
  let stdoutPipe = Pipe()
  let stderrPipe = Pipe()
  process.standardOutput = stdoutPipe
  process.standardError = stderrPipe
  try process.run()
  let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
  let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()
  return CLIRunResult(exitCode: process.terminationStatus, stdout: stdoutData, stderr: stderrData)
}

/// Mirrors the normalization `scripts/conformance.ts` and `CoreTests.swift` both use: zero out
/// `tool.version` since the two implementations' own version strings aren't required to match.
private func normalized(_ value: JSONValue) -> JSONValue {
  guard case .object(var object) = value else { return value }
  if case .object(var tool)? = object["tool"] {
    tool["version"] = .string("")
    object["tool"] = .object(tool)
  }
  return .object(object)
}

private func loadGoldenEnvelope(_ name: String) -> JSONValue {
  let data = try! Data(contentsOf: goldenURL(name))
  return try! JSONDecoder().decode(JSONValue.self, from: data)
}

private func loadGoldenValue(_ name: String) -> JSONValue {
  guard case .object(let object) = loadGoldenEnvelope(name), let value = object["value"] else {
    fatalError("\(name) is not an \"ok: true\" golden fixture")
  }
  return normalized(value)
}

/// `storeready check --format json` default `--fail-on error`: a `blocked` report (at least one
/// error finding) exits 1; `attention`/`ready` exit 0. Anything that wasn't even analyzable
/// (`ok: false` in the golden) exits 2.
private func expectedExitCode(forGolden name: String) -> Int32 {
  guard case .object(let object) = loadGoldenEnvelope(name), case .bool(let ok)? = object["ok"]
  else { fatalError("\(name) has no \"ok\" field") }
  guard ok, case .object(let value)? = object["value"],
    case .object(let summary)? = value["summary"],
    case .string(let status)? = summary["status"]
  else { return 2 }
  return status == "blocked" ? 1 : 0
}

private struct FixtureCase {
  let fileName: String
  let asOf: String
  let goldenName: String

  init(_ fileName: String, asOf: String = "2026-10-20", goldenName: String? = nil) {
    self.fileName = fileName
    self.asOf = asOf
    self.goldenName =
      goldenName
      ?? fileName.replacingOccurrences(
        of: #"\.(ipa|aab|apk)$"#, with: "", options: .regularExpression)
  }
}

private let fixtureCases: [FixtureCase] = [
  // iOS — fixtures/ios.golden.test.ts's exact set, all checked as of the same date.
  FixtureCase("ios-not-a-zip.ipa"),
  FixtureCase("ios-no-payload.ipa"),
  FixtureCase("ios-passing-app.ipa"),
  FixtureCase("ios-old-xcode.ipa"),
  FixtureCase("ios-old-minos.ipa"),
  FixtureCase("ios-priv-001-missing-manifest.ipa"),
  FixtureCase("ios-priv-002-missing-category.ipa"),
  FixtureCase("ios-priv-003-bad-reason-code.ipa"),
  FixtureCase("ios-priv-003-malformed-manifest.ipa"),
  FixtureCase("ios-priv-004-listed-sdk-no-manifest.ipa"),
  FixtureCase("ios-priv-004-listed-sdk-with-manifest.ipa"),
  FixtureCase("ios-appex-old-sdk.ipa"),
  FixtureCase("ios-fat-binary.ipa"),
  FixtureCase("ios-encrypted-binary.ipa"),
  FixtureCase("ios-binary-plist.ipa"),
  // Android — fixtures/android.golden.test.ts's exact set, including both sides of the
  // AND-16K-* 2027-02-01 severity boundary against the same fixture file.
  FixtureCase("android-aab-passing.aab"),
  FixtureCase("android-aab-tsdk-low.aab"),
  FixtureCase("android-aab-tsdk-wear.aab"),
  FixtureCase("android-aab-tsdk-tv.aab"),
  FixtureCase("android-aab-tsdk-preview.aab"),
  FixtureCase("android-aab-missing-uses-sdk.aab"),
  FixtureCase(
    "android-aab-16k-load-misaligned.aab", asOf: "2026-10-20",
    goldenName: "android-aab-16k-load-misaligned-warning"),
  FixtureCase(
    "android-aab-16k-load-misaligned.aab", asOf: "2027-02-01",
    goldenName: "android-aab-16k-load-misaligned-error"),
  FixtureCase(
    "android-aab-16k-tv-misaligned.aab", asOf: "2026-07-31",
    goldenName: "android-aab-16k-tv-misaligned-warning"),
  FixtureCase(
    "android-aab-16k-tv-misaligned.aab", asOf: "2026-08-01",
    goldenName: "android-aab-16k-tv-misaligned-error"),
  FixtureCase(
    "android-aab-16k-wear-misaligned.aab", asOf: "2026-09-14",
    goldenName: "android-aab-16k-wear-misaligned-warning"),
  FixtureCase(
    "android-aab-16k-wear-misaligned.aab", asOf: "2026-09-15",
    goldenName: "android-aab-16k-wear-misaligned-error"),
  FixtureCase("android-aab-16k-relro-misaligned.aab"),
  FixtureCase("android-aab-16k-relro-exempt.aab"),
  FixtureCase("android-aab-16k-bundleconfig-missing-flag.aab"),
  FixtureCase("android-aab-64bit-missing.aab"),
  FixtureCase("android-aab-malformed-manifest.aab"),
  FixtureCase("android-apk-passing.apk"),
  FixtureCase("android-apk-zip-misaligned.apk"),
  FixtureCase("android-apk-zip-compressed-skipped.apk"),
  FixtureCase("android-apk-not-a-zip.apk"),
  FixtureCase("android-apk-no-manifest.apk"),
]

@Test func checkCommandMatchesGoldenJSONAndExitCodeForEveryFixture() throws {
  for fixture in fixtureCases {
    let result = try runStoreReady([
      "check", fixtureURL(fixture.fileName).path, "--format", "json", "--as-of", fixture.asOf,
    ])
    let expectedExit = expectedExitCode(forGolden: fixture.goldenName)
    #expect(result.exitCode == expectedExit, "[\(fixture.goldenName)] exit code")

    if expectedExit == 2 {
      #expect(!result.stderr.isEmpty, "[\(fixture.goldenName)] expected an error message")
      continue
    }

    let stdout = try JSONDecoder().decode(JSONValue.self, from: result.stdout)
    #expect(
      normalized(stdout) == loadGoldenValue(fixture.goldenName),
      "[\(fixture.goldenName)] JSON output mismatch")
  }
}

@Test func checkFailOnNeverAlwaysExitsZeroEvenWhenBlocked() throws {
  let result = try runStoreReady([
    "check", fixtureURL("android-aab-tsdk-low.aab").path, "--format", "json", "--as-of",
    "2026-10-20", "--fail-on", "never",
  ])
  #expect(result.exitCode == 0)
}

@Test func checkExitsTwoForAMissingFile() throws {
  let result = try runStoreReady(["check", "/no/such/file.ipa"])
  #expect(result.exitCode == 2)
  #expect(!result.stderr.isEmpty)
}

@Test func rulesCommandPrintsValidJSON() throws {
  let result = try runStoreReady(["rules", "--format", "json"])
  #expect(result.exitCode == 0)
  let decoded = try JSONDecoder().decode(RulesFile.self, from: result.stdout)
  #expect(!decoded.rules.isEmpty)
}
