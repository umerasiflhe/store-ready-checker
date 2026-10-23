/// Mirrors `packages/core/src/report/markdown.ts`. Deterministic: same input always produces the
/// same string, since `findings` is already sorted by `buildReport`.

private let statusLabel: [ReportStatus: String] = [
  .blocked: "🚫 Blocked",
  .attention: "⚠️ Needs attention",
  .ready: "✅ Ready",
]

private let severityLabel: [Severity: String] = [
  .error: "❌ Error",
  .warning: "⚠️ Warning",
  .info: "ℹ️ Info",
]

private func escapeCell(_ value: String) -> String {
  value.replacingOccurrences(of: "|", with: "\\|").replacingOccurrences(of: "\n", with: " ")
}

private func formatEvidenceValue(_ value: JSONValue) -> String {
  switch value {
  case .array(let items):
    return items.map(formatEvidenceValue).joined(separator: ", ")
  case .string(let value):
    return value
  case .null:
    return "null"
  case .bool(let value):
    return value ? "true" : "false"
  case .number(let value):
    if value == value.rounded(), abs(value) < 1e15 {
      return String(Int64(value))
    }
    return String(value)
  case .object:
    return String(describing: value)
  }
}

private func findingToMarkdown(_ finding: Finding) -> String {
  var lines: [String] = []
  let heuristicBadge = finding.confidence == .heuristic ? " _(heuristic)_" : ""
  lines.append(
    "### \(severityLabel[finding.severity]!) · `\(finding.ruleId)` — \(finding.title)\(heuristicBadge)"
  )
  lines.append("")
  lines.append(finding.message)

  if !finding.evidence.isEmpty {
    lines.append("")
    lines.append("| Evidence | Value |")
    lines.append("| --- | --- |")
    for key in finding.evidence.keys.sorted() {
      lines.append(
        "| \(escapeCell(key)) | \(escapeCell(formatEvidenceValue(finding.evidence[key]!))) |"
      )
    }
  }

  if !finding.fix.isEmpty {
    lines.append("")
    lines.append("**Fix:**")
    for step in finding.fix {
      lines.append("- \(step)")
    }
  }

  if !finding.sources.isEmpty {
    lines.append("")
    lines.append("**Sources:**")
    for source in finding.sources {
      lines.append("- [\(source.title)](\(source.url))")
    }
  }

  return lines.joined(separator: "\n")
}

public func reportToMarkdown(_ report: Report) -> String {
  var lines: [String] = []

  lines.append("# Store Ready report — \(report.input.fileName)")
  lines.append("")
  lines.append(
    "**\(statusLabel[report.summary.status]!)** · \(report.summary.errors) error(s) · "
      + "\(report.summary.warnings) warning(s) · \(report.summary.infos) info"
  )
  lines.append("")
  lines.append("- **Checked as of:** \(report.asOf)")
  lines.append(
    "- **Tool:** \(report.tool.name) \(report.tool.version) · rules \(report.tool.rulesVersion)")
  lines.append("- **Platform:** \(report.app.platform.rawValue)")
  if !report.app.id.isEmpty || !report.app.version.isEmpty || !report.app.build.isEmpty {
    lines.append("- **App:** \(report.app.id) v\(report.app.version) (build \(report.app.build))")
  }
  lines.append(
    "- **File:** \(report.input.fileName) (\(report.input.sizeBytes) bytes, \(report.input.kind.rawValue))"
  )

  if !report.findings.isEmpty {
    lines.append("")
    lines.append("## Findings")
    for finding in report.findings {
      lines.append("")
      lines.append(findingToMarkdown(finding))
    }
  }

  lines.append("")
  lines.append("_Not affiliated with Apple or Google._")

  return lines.joined(separator: "\n")
}
