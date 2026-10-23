import Foundation
import Testing

@testable import StoreReadyCore

private struct Case {
  let fixture: String
  let golden: String
  let asOf: String
  let kind: AndroidInputKind
}

private let androidCases: [Case] = [
  Case(
    fixture: "android-aab-16k-bundleconfig-missing-flag",
    golden: "android-aab-16k-bundleconfig-missing-flag",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-load-misaligned",
    golden: "android-aab-16k-load-misaligned-warning",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-load-misaligned",
    golden: "android-aab-16k-load-misaligned-error",
    asOf: "2027-02-01",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-relro-exempt",
    golden: "android-aab-16k-relro-exempt",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-relro-misaligned",
    golden: "android-aab-16k-relro-misaligned",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-64bit-missing",
    golden: "android-aab-64bit-missing",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-missing-uses-sdk",
    golden: "android-aab-missing-uses-sdk",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-passing", golden: "android-aab-passing", asOf: "2026-10-20", kind: .aab),
  Case(
    fixture: "android-aab-tsdk-low",
    golden: "android-aab-tsdk-low",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-tsdk-preview",
    golden: "android-aab-tsdk-preview",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-tsdk-tv",
    golden: "android-aab-tsdk-tv",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-tsdk-wear",
    golden: "android-aab-tsdk-wear",
    asOf: "2026-10-20",
    kind: .aab
  ),
  Case(
    fixture: "android-apk-passing",
    golden: "android-apk-passing",
    asOf: "2026-10-20",
    kind: .apk
  ),
  Case(
    fixture: "android-apk-zip-compressed-skipped",
    golden: "android-apk-zip-compressed-skipped",
    asOf: "2026-10-20",
    kind: .apk
  ),
  Case(
    fixture: "android-apk-zip-misaligned",
    golden: "android-apk-zip-misaligned",
    asOf: "2026-10-20",
    kind: .apk
  ),
]

private struct GoldenFinding: Decodable {
  let ruleId: String
  let severity: String
}

private struct GoldenReport: Decodable {
  let findings: [GoldenFinding]
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

/// Runs every Android fixture with an "ok: true" golden (including both sides of the
/// 2027-02-01 16K-severity boundary, using the same fixture at two different `asOf` dates) through
/// `analyzeAndroidBundle` + `evaluateAndroidRules` and checks the resulting (ruleId, severity)
/// pairs exactly match the golden's findings.
@Test func allAndroidFixturesProduceTheExpectedFindings() throws {
  let rulesFile = loadRulesFile()

  for testCase in androidCases {
    let golden = loadGolden(testCase.golden)
    guard
      case .success(let archive) = ZipArchive.open(
        url: fixtureURL("\(testCase.fixture).\(testCase.kind.rawValue)")
      )
    else {
      Issue.record("[\(testCase.golden)] expected the fixture to open")
      continue
    }
    guard case .success(let facts) = analyzeAndroidBundle(archive, kind: testCase.kind) else {
      Issue.record("[\(testCase.golden)] expected facts to be extracted")
      continue
    }
    let findings = sortFindings(evaluateAndroidRules(facts, rulesFile, testCase.asOf))
    let actualPairs = findings.map { "\($0.ruleId):\($0.severity.rawValue)" }
    let expectedPairs = golden.findings.map { "\($0.ruleId):\($0.severity)" }
    #expect(actualPairs == expectedPairs, "[\(testCase.golden)] findings mismatch")
  }
}
