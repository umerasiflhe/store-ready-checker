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
    fixture: "android-aab-16k-tv-misaligned",
    golden: "android-aab-16k-tv-misaligned-warning",
    asOf: "2026-07-31",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-tv-misaligned",
    golden: "android-aab-16k-tv-misaligned-error",
    asOf: "2026-08-01",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-wear-misaligned",
    golden: "android-aab-16k-wear-misaligned-warning",
    asOf: "2026-09-14",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-16k-wear-misaligned",
    golden: "android-aab-16k-wear-misaligned-error",
    asOf: "2026-09-15",
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
    fixture: "android-aab-64bit-tv-missing",
    golden: "android-aab-64bit-tv-missing-before",
    asOf: "2026-07-31",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-64bit-tv-missing",
    golden: "android-aab-64bit-tv-missing-error",
    asOf: "2026-08-01",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-64bit-wear-missing",
    golden: "android-aab-64bit-wear-missing-before",
    asOf: "2026-09-14",
    kind: .aab
  ),
  Case(
    fixture: "android-aab-64bit-wear-missing",
    golden: "android-aab-64bit-wear-missing-error",
    asOf: "2026-09-15",
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

private func factsWithTarget(_ target: Int, usesFeatures: [String] = []) -> AndroidFacts {
  let manifest = ManifestFacts(
    packageName: "com.example.app",
    versionCode: 1,
    versionName: "1.0",
    minSdkVersion: 24,
    targetSdkVersion: .released(target),
    targetSdkAssumed: false,
    usesFeatures: usesFeatures
  )
  return AndroidFacts(
    kind: .aab,
    modules: [ModuleFacts(name: "base", manifest: manifest)],
    nativeLibs: NativeLibsFacts(libraries: []),
    bundleConfig: nil
  )
}

private func tsdk002Findings(
  _ facts: AndroidFacts,
  _ options: AndroidRuleCheckOptions? = nil
) -> [Finding] {
  evaluateAndroidRules(facts, loadRulesFile(), "2026-10-20", options)
    .filter { $0.ruleId == "AND-TSDK-002" }
}

/// Mirrors the TS `AND-TSDK-002` per-form-factor cases in `android.test.ts`.
@Test(arguments: [
  ("phone_tablet", [String](), 35),
  ("wear", ["android.hardware.type.watch"], 34),
  ("tv", ["android.software.leanback"], 34),
  ("automotive", ["android.hardware.type.automotive"], 32),
])
func andTsdk002UsesTheFormFactorMinimum(
  formFactor: String,
  usesFeatures: [String],
  required: Int
) {
  #expect(tsdk002Findings(factsWithTarget(required, usesFeatures: usesFeatures)).isEmpty)
  let found = tsdk002Findings(factsWithTarget(required - 1, usesFeatures: usesFeatures))
  #expect(found.count == 1)
  #expect(found.first?.severity == .warning)
  #expect(found.first?.evidence["formFactor"] == .string(formFactor))
  #expect(found.first?.evidence["required"] == .number(Double(required)))
}

@Test func andTsdk002PrefersAnExplicitFormFactorOverride() {
  // Inferred phone/tablet needs 35; overridden to automotive, 33 is enough.
  let facts = factsWithTarget(33)
  #expect(tsdk002Findings(facts).count == 1)
  #expect(tsdk002Findings(facts, AndroidRuleCheckOptions(formFactorOverride: .automotive)).isEmpty)
}
