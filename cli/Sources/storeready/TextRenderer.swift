import StoreReadyCore

private enum Ansi {
  static let reset = "\u{1B}[0m"
  static let red = "\u{1B}[31m"
  static let yellow = "\u{1B}[33m"
  static let blue = "\u{1B}[34m"
  static let green = "\u{1B}[32m"
}

private func colorize(_ text: String, _ code: String, enabled: Bool) -> String {
  enabled ? "\(code)\(text)\(Ansi.reset)" : text
}

private func evidenceValueText(_ value: JSONValue) -> String {
  switch value {
  case .string(let value): return value
  case .number(let value):
    return value == value.rounded() ? String(Int64(value)) : String(value)
  case .bool(let value): return value ? "true" : "false"
  case .null: return "null"
  case .array(let items): return items.map(evidenceValueText).joined(separator: ",")
  case .object: return String(describing: value)
  }
}

/// Compact text output: one line per finding plus its evidence, colored when the destination is
/// a TTY (brief §6.6).
func renderText(_ report: Report, color: Bool) -> String {
  var lines: [String] = []

  let (statusLabel, statusColor): (String, String) =
    switch report.summary.status {
    case .blocked: ("BLOCKED", Ansi.red)
    case .attention: ("ATTENTION", Ansi.yellow)
    case .ready: ("READY", Ansi.green)
    }
  lines.append(
    colorize(statusLabel, statusColor, enabled: color)
      + " \(report.input.fileName) — \(report.summary.errors) error(s), "
      + "\(report.summary.warnings) warning(s), \(report.summary.infos) info"
  )

  for finding in report.findings {
    let (severityLabel, severityColor): (String, String) =
      switch finding.severity {
      case .error: ("ERROR", Ansi.red)
      case .warning: ("WARN", Ansi.yellow)
      case .info: ("INFO", Ansi.blue)
      }
    let heuristic = finding.confidence == .heuristic ? " (heuristic)" : ""
    lines.append(
      "\(colorize(severityLabel, severityColor, enabled: color)) \(finding.ruleId) \(finding.title)\(heuristic)"
    )
    lines.append("  \(finding.message)")
    if !finding.evidence.isEmpty {
      let evidenceText = finding.evidence.keys.sorted()
        .map { "\($0)=\(evidenceValueText(finding.evidence[$0]!))" }
        .joined(separator: ", ")
      lines.append("  evidence: \(evidenceText)")
    }
    if !finding.fix.isEmpty {
      lines.append("  fix: \(finding.fix.joined(separator: "; "))")
    }
  }

  return lines.joined(separator: "\n")
}
