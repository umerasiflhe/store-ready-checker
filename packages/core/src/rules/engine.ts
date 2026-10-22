import type { IosFacts } from '../ios/analyze.ts';
import { IOS_RULE_CHECKS, type IosCheckSeeds } from './checks/ios.ts';
import type { Finding, Rule, RuleTimelineEntry, RulesFile, Severity } from './types.ts';

export interface ResolvedSeverity {
  readonly severity: Severity;
  readonly note: string | undefined;
  /** Set when `asOf` is before the rule's earliest timeline entry: the configured severity has
   * been overridden to `info` per the brief ("not yet in force... produce an info finding"). */
  readonly becomesRequiredOn: string | undefined;
}

function sortedTimeline(timeline: readonly RuleTimelineEntry[]): readonly RuleTimelineEntry[] {
  return [...timeline].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** ISO `YYYY-MM-DD` dates compare correctly as plain strings, so no Date parsing is needed. */
export function resolveTimelineSeverity(
  timeline: readonly RuleTimelineEntry[],
  asOf: string,
): ResolvedSeverity {
  const sorted = sortedTimeline(timeline);
  const first = sorted.at(0);
  if (!first) {
    throw new Error('a rule timeline must have at least one entry');
  }
  if (asOf < first.from) {
    return { severity: 'info', note: undefined, becomesRequiredOn: first.from };
  }
  let active = first;
  for (const entry of sorted) {
    if (entry.from <= asOf) {
      active = entry;
    } else {
      break;
    }
  }
  return { severity: active.severity, note: active.note, becomesRequiredOn: undefined };
}

export interface FindingParts {
  readonly title: string;
  readonly message: string;
  readonly evidence: Record<string, unknown>;
}

/** Assembles a `Finding` from a rule, its resolved severity, and check-specific details. */
export function buildFinding(rule: Rule, resolved: ResolvedSeverity, parts: FindingParts): Finding {
  const message = resolved.becomesRequiredOn
    ? `${parts.message} Becomes required on ${resolved.becomesRequiredOn}.`
    : parts.message;
  return {
    ruleId: rule.id,
    severity: resolved.severity,
    confidence: rule.confidence ?? 'certain',
    title: parts.title,
    message,
    evidence: parts.evidence,
    fix: rule.fix,
    sources: rule.sources,
  };
}

/** Evaluates every `platform: "ios"` rule in `rulesFile` against `facts`, "as of" `asOf`. */
export function evaluateIosRules(
  facts: IosFacts,
  rulesFile: RulesFile,
  asOf: string,
  seeds: IosCheckSeeds,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rulesFile.rules) {
    if (rule.platform !== 'ios') {
      continue;
    }
    const check = IOS_RULE_CHECKS[rule.id];
    if (!check) {
      continue;
    }
    findings.push(...check(facts, rule, asOf, seeds));
  }
  return findings;
}
