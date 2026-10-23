/// Mirrors `packages/core/src/rules/engine.ts`.

public struct ResolvedSeverity: Sendable {
  public let severity: Severity
  public let note: String?
  /// Set when `asOf` is before the rule's earliest timeline entry: the configured severity has
  /// been overridden to `.info` per the brief ("not yet in force... produce an info finding").
  public let becomesRequiredOn: String?
}

/// ISO `YYYY-MM-DD` dates compare correctly as plain ASCII strings, so no date parsing is
/// needed — same as the TS side.
public func resolveTimelineSeverity(_ timeline: [RuleTimelineEntry], asOf: String)
  -> ResolvedSeverity
{
  let sorted = timeline.sorted { $0.from < $1.from }
  guard let first = sorted.first else {
    fatalError("a rule timeline must have at least one entry")
  }
  if asOf < first.from {
    return ResolvedSeverity(severity: .info, note: nil, becomesRequiredOn: first.from)
  }
  var active = first
  for entry in sorted {
    if entry.from <= asOf {
      active = entry
    } else {
      break
    }
  }
  return ResolvedSeverity(severity: active.severity, note: active.note, becomesRequiredOn: nil)
}

public struct FindingParts: Sendable {
  public let title: String
  public let message: String
  public let evidence: [String: JSONValue]

  public init(title: String, message: String, evidence: [String: JSONValue]) {
    self.title = title
    self.message = message
    self.evidence = evidence
  }
}

public func buildFinding(_ rule: Rule, _ resolved: ResolvedSeverity, _ parts: FindingParts)
  -> Finding
{
  let message =
    resolved.becomesRequiredOn.map { "\(parts.message) Becomes required on \($0)." }
    ?? parts.message
  return Finding(
    ruleId: rule.id,
    severity: resolved.severity,
    confidence: rule.confidence ?? .certain,
    title: parts.title,
    message: message,
    evidence: parts.evidence,
    fix: rule.fix,
    sources: rule.sources
  )
}

public func evaluateIosRules(
  _ facts: IosFacts,
  _ rulesFile: RulesFile,
  _ asOf: String,
  _ seeds: IosCheckSeeds
) -> [Finding] {
  var findings: [Finding] = []
  for rule in rulesFile.rules where rule.platform == "ios" {
    guard let check = iosRuleChecks[rule.id] else { continue }
    findings.append(contentsOf: check(facts, rule, asOf, seeds))
  }
  return findings
}

/// `options.formFactorOverride`, when set, takes precedence over the manifest-inferred form
/// factor (brief §3.3: the CLI's future `--form-factor` flag and the web UI both need this).
public func evaluateAndroidRules(
  _ facts: AndroidFacts,
  _ rulesFile: RulesFile,
  _ asOf: String,
  _ options: AndroidRuleCheckOptions? = nil
) -> [Finding] {
  var findings: [Finding] = []
  for rule in rulesFile.rules where rule.platform == "android" {
    guard let check = androidRuleChecks[rule.id] else { continue }
    findings.append(contentsOf: check(facts, rule, asOf, options))
  }
  return findings
}
