import Foundation
import Testing

@testable import StoreReadyCore

private let iosFixturesWithFindings = [
  "ios-passing-app",
  "ios-binary-plist",
  "ios-encrypted-binary",
  "ios-fat-binary",
  "ios-old-minos",
  "ios-old-xcode",
  "ios-appex-old-sdk",
  "ios-priv-001-missing-manifest",
  "ios-priv-002-missing-category",
  "ios-priv-002-shared-api-declared",
  "ios-priv-003-bad-reason-code",
  "ios-priv-003-malformed-manifest",
  "ios-priv-004-listed-sdk-no-manifest",
  "ios-priv-004-listed-sdk-with-manifest",
]

private struct GoldenFinding: Decodable {
  let ruleId: String
  let severity: String
}

private struct GoldenReport: Decodable {
  let summary: GoldenSummary
  let findings: [GoldenFinding]
}

private struct GoldenSummary: Decodable {
  let status: String
}

private struct GoldenEnvelope: Decodable {
  let ok: Bool
  let value: GoldenReport?
}

private func loadGolden(_ name: String) -> GoldenReport {
  let url = repoRoot().appendingPathComponent("fixtures/expected/\(name).json")
  let data = try! Data(contentsOf: url)
  let envelope = try! JSONDecoder().decode(GoldenEnvelope.self, from: data)
  return envelope.value!
}

private func loadRulesFile() -> RulesFile {
  let json = loadRulesJSON("rules.json")
  let data = try! JSONEncoder().encode(json)
  return try! JSONDecoder().decode(RulesFile.self, from: data)
}

private func loadSeeds() -> IosCheckSeeds {
  guard case .success(let listedSdks) = parseListedSdksSeed(loadRulesJSON("apple-listed-sdks.json"))
  else { fatalError("expected the listed-sdks seed to parse") }
  guard
    case .success(let requiredReasonApis) = parseRequiredReasonSeed(
      loadRulesJSON("apple-required-reason-apis.json")
    )
  else { fatalError("expected the required-reason seed to parse") }
  return IosCheckSeeds(listedSdks: listedSdks, requiredReasonApis: requiredReasonApis)
}

/// Runs every iOS fixture with an "ok: true" golden through `analyzeIosBundles` +
/// `evaluateIosRules` and checks the resulting (ruleId, severity) pairs exactly match the
/// golden's findings — the same oracle `fixtures/expected/*.json` is for the TS implementation,
/// giving broad parity confidence well before the CLI itself exists (Phase G does the full
/// byte-for-byte JSON comparison once it does).
@Test func allIosFixturesProduceTheExpectedFindings() throws {
  let rulesFile = loadRulesFile()
  let seeds = loadSeeds()

  for name in iosFixturesWithFindings {
    let golden = loadGolden(name)
    guard case .success(let archive) = ZipArchive.open(url: fixtureURL("\(name).ipa")) else {
      Issue.record("[\(name)] expected the fixture to open")
      continue
    }
    guard case .success(let facts) = analyzeIosBundles(archive, seed: seeds.requiredReasonApis)
    else {
      Issue.record("[\(name)] expected facts to be extracted")
      continue
    }
    let findings = sortFindings(evaluateIosRules(facts, rulesFile, "2026-10-20", seeds))
    let actualPairs = findings.map { "\($0.ruleId):\($0.severity.rawValue)" }
    let expectedPairs = golden.findings.map { "\($0.ruleId):\($0.severity)" }
    #expect(actualPairs == expectedPairs, "[\(name)] findings mismatch")
  }
}
