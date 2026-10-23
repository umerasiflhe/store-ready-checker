/// Mirrors `packages/core/src/rules/types.ts` and `packages/core/src/report/types.ts`. Field
/// names match `schema/report.schema.json`/`schema/rules.schema.json` exactly so `JSONEncoder`
/// output round-trips through the schema validator unchanged.

public enum Severity: String, Codable, Sendable {
  case error
  case warning
  case info
}

public enum Confidence: String, Codable, Sendable {
  case certain
  case heuristic
}

public struct RuleSource: Codable, Sendable, Equatable {
  public let title: String
  public let url: String

  public init(title: String, url: String) {
    self.title = title
    self.url = url
  }
}

public struct RuleTimelineEntry: Codable, Sendable {
  public let from: String
  public let severity: Severity
  public let note: String?

  public init(from: String, severity: Severity, note: String? = nil) {
    self.from = from
    self.severity = severity
    self.note = note
  }
}

public struct Rule: Codable, Sendable {
  public let id: String
  public let platform: String
  public let title: String
  public let confidence: Confidence?
  public let appliesWhen: [String: JSONValue]?
  public let parameters: [String: JSONValue]?
  public let timeline: [RuleTimelineEntry]
  public let sources: [RuleSource]
  public let fix: [String]
}

public struct RulesFile: Codable, Sendable {
  public let rulesVersion: String
  public let rules: [Rule]
}

public struct Finding: Codable, Sendable {
  public let ruleId: String
  public let severity: Severity
  public let confidence: Confidence
  public let title: String
  public let message: String
  public let evidence: [String: JSONValue]
  public let fix: [String]
  public let sources: [RuleSource]

  public init(
    ruleId: String,
    severity: Severity,
    confidence: Confidence,
    title: String,
    message: String,
    evidence: [String: JSONValue],
    fix: [String],
    sources: [RuleSource]
  ) {
    self.ruleId = ruleId
    self.severity = severity
    self.confidence = confidence
    self.title = title
    self.message = message
    self.evidence = evidence
    self.fix = fix
    self.sources = sources
  }
}

public struct ReportTool: Codable, Sendable {
  public let name: String
  public let version: String
  public let rulesVersion: String

  public init(name: String, version: String, rulesVersion: String) {
    self.name = name
    self.version = version
    self.rulesVersion = rulesVersion
  }
}

public enum InputKind: String, Codable, Sendable {
  case ipa
  case aab
  case apk
}

public struct ReportInput: Codable, Sendable {
  public let fileName: String
  public let sizeBytes: Int
  public let kind: InputKind

  public init(fileName: String, sizeBytes: Int, kind: InputKind) {
    self.fileName = fileName
    self.sizeBytes = sizeBytes
    self.kind = kind
  }
}

public enum Platform: String, Codable, Sendable {
  case ios
  case android
}

public struct ReportApp: Codable, Sendable {
  public let platform: Platform
  public let id: String
  public let version: String
  public let build: String

  public init(platform: Platform, id: String, version: String, build: String) {
    self.platform = platform
    self.id = id
    self.version = version
    self.build = build
  }
}

public enum ReportStatus: String, Codable, Sendable {
  case blocked
  case attention
  case ready
}

public struct ReportSummary: Codable, Sendable, Equatable {
  public let status: ReportStatus
  public let errors: Int
  public let warnings: Int
  public let infos: Int
}

public struct Report: Codable, Sendable {
  public let tool: ReportTool
  public let asOf: String
  public let input: ReportInput
  public let app: ReportApp
  public let summary: ReportSummary
  public let findings: [Finding]
}
