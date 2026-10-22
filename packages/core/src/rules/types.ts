import { type Result, tryParse } from '../util/result.ts';

export type Severity = 'error' | 'warning' | 'info';
export type Confidence = 'certain' | 'heuristic';

export interface RuleTimelineEntry {
  readonly from: string;
  readonly severity: Severity;
  readonly note: string | undefined;
}

export interface RuleSource {
  readonly title: string;
  readonly url: string;
}

export interface Rule {
  readonly id: string;
  readonly platform: 'ios' | 'android';
  readonly title: string;
  readonly confidence: Confidence | undefined;
  readonly appliesWhen: Record<string, unknown> | undefined;
  readonly parameters: Record<string, unknown> | undefined;
  readonly timeline: readonly RuleTimelineEntry[];
  readonly sources: readonly RuleSource[];
  readonly fix: readonly string[];
}

export interface RulesFile {
  readonly rulesVersion: string;
  readonly rules: readonly Rule[];
}

export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly title: string;
  readonly message: string;
  readonly evidence: Record<string, unknown>;
  readonly fix: readonly string[];
  readonly sources: readonly RuleSource[];
}

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info'];
const CONFIDENCES: readonly Confidence[] = ['certain', 'heuristic'];

/** Parses `rules/rules.json` (per `schema/rules.schema.json`). Never throws on malformed data. */
export function parseRulesFile(data: unknown): Result<RulesFile> {
  return tryParse('RULES_FILE_INVALID', () => {
    const root = asRecord(data);
    const rulesVersion = root?.rulesVersion;
    const rawRules = root?.rules;
    if (typeof rulesVersion !== 'string' || !Array.isArray(rawRules)) {
      throw new Error('expected { rulesVersion: string, rules: [] }');
    }
    return { rulesVersion, rules: rawRules.map(parseRule) };
  });
}

function parseRule(value: unknown): Rule {
  const record = asRecord(value);
  const id = record?.id;
  const platform = record?.platform;
  const title = record?.title;
  const rawTimeline = record?.timeline;
  const rawSources = record?.sources;
  const rawFix = record?.fix;
  if (
    typeof id !== 'string' ||
    (platform !== 'ios' && platform !== 'android') ||
    typeof title !== 'string' ||
    !Array.isArray(rawTimeline) ||
    !Array.isArray(rawSources) ||
    !Array.isArray(rawFix)
  ) {
    throw new Error(`malformed rule entry: ${JSON.stringify(value)}`);
  }
  const confidence = record?.confidence;
  return {
    id,
    platform,
    title,
    confidence: isConfidence(confidence) ? confidence : undefined,
    appliesWhen: asRecord(record?.appliesWhen),
    parameters: asRecord(record?.parameters),
    timeline: rawTimeline.map(parseTimelineEntry),
    sources: rawSources.map(parseSource),
    fix: rawFix.filter(isString),
  };
}

function parseTimelineEntry(value: unknown): RuleTimelineEntry {
  const record = asRecord(value);
  const from = record?.from;
  const severity = record?.severity;
  if (typeof from !== 'string' || !isSeverity(severity)) {
    throw new Error(`malformed timeline entry: ${JSON.stringify(value)}`);
  }
  const note = record?.note;
  return { from, severity, note: typeof note === 'string' ? note : undefined };
}

function parseSource(value: unknown): RuleSource {
  const record = asRecord(value);
  const title = record?.title;
  const url = record?.url;
  if (typeof title !== 'string' || typeof url !== 'string') {
    throw new Error(`malformed source entry: ${JSON.stringify(value)}`);
  }
  return { title, url };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && (CONFIDENCES as readonly string[]).includes(value);
}
