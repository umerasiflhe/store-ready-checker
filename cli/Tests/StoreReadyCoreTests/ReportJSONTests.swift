import Foundation
import Testing

@testable import StoreReadyCore

/// Decoding a real golden fixture and re-encoding it must round-trip to the same structural
/// content — the main thing that matters for conformance (brief §7.4 diffs parsed values, not
/// raw text).
@Test func reportRoundTripsThroughAGoldenFixture() throws {
  let goldenURL = repoRoot().appendingPathComponent(
    "fixtures/expected/android-aab-16k-load-misaligned-warning.json"
  )
  let goldenData = try Data(contentsOf: goldenURL)
  let golden = try JSONSerialization.jsonObject(with: goldenData) as! [String: Any]
  let value = golden["value"] as! [String: Any]
  let valueData = try JSONSerialization.data(withJSONObject: value)

  let decoder = JSONDecoder()
  let report = try decoder.decode(Report.self, from: valueData)

  #expect(report.summary.status == .attention)
  #expect(report.findings.count == 1)
  #expect(report.findings[0].ruleId == "AND-16K-001")
  #expect(report.findings[0].evidence["abi"]?.stringValue == "arm64-v8a")

  let encoder = JSONEncoder()
  let reEncoded = try encoder.encode(report)
  let reEncodedObject = try JSONSerialization.jsonObject(with: reEncoded) as! [String: Any]
  let reEncodedData = try JSONSerialization.data(withJSONObject: reEncodedObject)
  let reDecoded = try decoder.decode(Report.self, from: reEncodedData)

  #expect(reDecoded.asOf == report.asOf)
  #expect(reDecoded.app.id == report.app.id)
  #expect(reDecoded.findings[0].title == report.findings[0].title)
}

@Test func reportToMarkdownIncludesKeyFields() throws {
  let report = Report(
    tool: ReportTool(name: "store-ready", version: "1.0.0", rulesVersion: "2026.10.20"),
    asOf: "2026-10-20",
    input: ReportInput(fileName: "MyApp.ipa", sizeBytes: 123, kind: .ipa),
    app: ReportApp(platform: .ios, id: "com.example.app", version: "1.0", build: "1"),
    summary: ReportSummary(status: .blocked, errors: 1, warnings: 0, infos: 0),
    findings: [
      Finding(
        ruleId: "IOS-SDK-001",
        severity: .error,
        confidence: .certain,
        title: "Built with an old SDK",
        message: "Upgrade to Xcode 26.",
        evidence: ["bundle": .string("Payload/MyApp.app")],
        fix: ["Install Xcode 26"],
        sources: [RuleSource(title: "Apple docs", url: "https://example.com")]
      )
    ]
  )
  let markdown = reportToMarkdown(report)
  #expect(markdown.contains("# Store Ready report — MyApp.ipa"))
  #expect(markdown.contains("Blocked"))
  #expect(markdown.contains("IOS-SDK-001"))
  #expect(markdown.contains("Install Xcode 26"))
  #expect(markdown.contains("[Apple docs](https://example.com)"))
}
