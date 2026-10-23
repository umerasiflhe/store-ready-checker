/// Mirrors `packages/core/src/report/build.ts`.

private let severityOrder: [Severity: Int] = [.error: 0, .warning: 1, .info: 2]

private func location(of finding: Finding) -> String {
  if case .string(let value)? = finding.evidence["bundle"] {
    return value
  }
  return ""
}

/// Sorted by severity (error, then warning, then info), then rule ID, then location. Swift's
/// `sorted(by:)` has been stable since Swift 5, matching JS's stable-sort requirement — ties in
/// all three keys preserve the input order.
public func sortFindings(_ findings: [Finding]) -> [Finding] {
  findings.sorted { a, b in
    let severityDiff = severityOrder[a.severity]! - severityOrder[b.severity]!
    if severityDiff != 0 {
      return severityDiff < 0
    }
    if a.ruleId != b.ruleId {
      return a.ruleId < b.ruleId
    }
    return location(of: a) < location(of: b)
  }
}

public struct BuildReportParams {
  public let tool: ReportTool
  public let asOf: String
  public let input: ReportInput
  public let app: ReportApp
  public let findings: [Finding]

  public init(
    tool: ReportTool,
    asOf: String,
    input: ReportInput,
    app: ReportApp,
    findings: [Finding]
  ) {
    self.tool = tool
    self.asOf = asOf
    self.input = input
    self.app = app
    self.findings = findings
  }
}

public func buildReport(_ params: BuildReportParams) -> Report {
  let findings = sortFindings(params.findings)
  let errors = findings.filter { $0.severity == .error }.count
  let warnings = findings.filter { $0.severity == .warning }.count
  let infos = findings.filter { $0.severity == .info }.count
  let status: ReportStatus = errors > 0 ? .blocked : (warnings > 0 ? .attention : .ready)
  return Report(
    tool: params.tool,
    asOf: params.asOf,
    input: params.input,
    app: params.app,
    summary: ReportSummary(status: status, errors: errors, warnings: warnings, infos: infos),
    findings: findings
  )
}
