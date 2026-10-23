import Testing

@testable import StoreReadyCore

private func finding(
  ruleId: String = "IOS-TEST-001",
  severity: Severity = .error,
  bundle: String? = nil
) -> Finding {
  var evidence: [String: JSONValue] = [:]
  if let bundle {
    evidence["bundle"] = .string(bundle)
  }
  return Finding(
    ruleId: ruleId,
    severity: severity,
    confidence: .certain,
    title: "t",
    message: "m",
    evidence: evidence,
    fix: [],
    sources: []
  )
}

@Test func sortFindingsOrdersBySeverityThenRuleIdThenLocation() {
  let sorted = sortFindings([
    finding(ruleId: "A", severity: .info),
    finding(ruleId: "B", severity: .error),
    finding(ruleId: "C", severity: .warning),
  ])
  #expect(sorted.map(\.severity) == [.error, .warning, .info])
}

@Test func sortFindingsBreaksTiesByRuleId() {
  let sorted = sortFindings([
    finding(ruleId: "IOS-B-001", severity: .error),
    finding(ruleId: "IOS-A-001", severity: .error),
  ])
  #expect(sorted.map(\.ruleId) == ["IOS-A-001", "IOS-B-001"])
}

@Test func sortFindingsBreaksFurtherTiesByLocation() {
  let sorted = sortFindings([
    finding(ruleId: "IOS-A-001", severity: .error, bundle: "Payload/B.app"),
    finding(ruleId: "IOS-A-001", severity: .error, bundle: "Payload/A.app"),
  ])
  #expect(sorted.map { $0.evidence["bundle"]?.stringValue } == ["Payload/A.app", "Payload/B.app"])
}

@Test func buildReportDerivesBlockedWhenThereIsAtLeastOneError() {
  let report = buildReport(
    BuildReportParams(
      tool: ReportTool(name: "store-ready", version: "1.0.0", rulesVersion: "2026.10.20"),
      asOf: "2026-10-20",
      input: ReportInput(fileName: "MyApp.ipa", sizeBytes: 123, kind: .ipa),
      app: ReportApp(platform: .ios, id: "com.example.app", version: "1.0", build: "1"),
      findings: [finding(severity: .error), finding(ruleId: "Z", severity: .info)]
    )
  )
  #expect(report.summary.status == .blocked)
  #expect(report.summary.errors == 1)
  #expect(report.summary.infos == 1)
}

@Test func buildReportDerivesAttentionWhenOnlyWarnings() {
  let report = buildReport(
    BuildReportParams(
      tool: ReportTool(name: "store-ready", version: "1.0.0", rulesVersion: "2026.10.20"),
      asOf: "2026-10-20",
      input: ReportInput(fileName: "MyApp.ipa", sizeBytes: 123, kind: .ipa),
      app: ReportApp(platform: .ios, id: "com.example.app", version: "1.0", build: "1"),
      findings: [finding(severity: .warning)]
    )
  )
  #expect(report.summary.status == .attention)
}

@Test func buildReportDerivesReadyForEmptyFindings() {
  let report = buildReport(
    BuildReportParams(
      tool: ReportTool(name: "store-ready", version: "1.0.0", rulesVersion: "2026.10.20"),
      asOf: "2026-10-20",
      input: ReportInput(fileName: "MyApp.ipa", sizeBytes: 123, kind: .ipa),
      app: ReportApp(platform: .ios, id: "com.example.app", version: "1.0", build: "1"),
      findings: []
    )
  )
  #expect(report.summary == ReportSummary(status: .ready, errors: 0, warnings: 0, infos: 0))
}
