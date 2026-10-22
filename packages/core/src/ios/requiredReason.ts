import { type Result, tryParse } from '../util/result.ts';

export interface RequiredReasonCategory {
  readonly type: string;
  readonly reasonCodes: readonly string[];
  readonly evidence: { readonly symbols: readonly string[]; readonly selectors: readonly string[] };
}

export interface RequiredReasonSeed {
  readonly categories: readonly RequiredReasonCategory[];
}

export interface DetectedRequiredReasonUsage {
  readonly category: string;
  readonly matchedSymbols: readonly string[];
  readonly matchedSelectors: readonly string[];
}

/** Parses `rules/apple-required-reason-apis.json`. Never throws on malformed data. */
export function parseRequiredReasonSeed(data: unknown): Result<RequiredReasonSeed> {
  return tryParse('REQUIRED_REASON_SEED_INVALID', () => {
    const root = asRecord(data);
    const categories = asArray(root?.categories);
    if (!categories) {
      throw new Error('expected a "categories" array');
    }
    return { categories: categories.map(parseCategory) };
  });
}

function parseCategory(value: unknown): RequiredReasonCategory {
  const record = asRecord(value);
  const type = record?.type;
  const reasonCodes = asArray(record?.reasonCodes);
  const evidence = asRecord(record?.evidence);
  const symbols = asArray(evidence?.symbols);
  const selectors = asArray(evidence?.selectors);
  if (typeof type !== 'string' || !reasonCodes || !symbols || !selectors) {
    throw new Error('malformed required-reason category entry');
  }
  return {
    type,
    reasonCodes: reasonCodes.filter(isString),
    evidence: { symbols: symbols.filter(isString), selectors: selectors.filter(isString) },
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Matches Mach-O facts against the seed data to find which required-reason API categories this
 * bundle appears to use, per the `ipa-analysis` skill (detection is heuristic).
 */
export function detectRequiredReasonUsage(
  facts: { readonly symbols: readonly string[]; readonly selectors: readonly string[] },
  seed: RequiredReasonSeed,
): DetectedRequiredReasonUsage[] {
  const symbols = new Set(facts.symbols);
  const selectors = new Set(facts.selectors);
  const detected: DetectedRequiredReasonUsage[] = [];
  for (const category of seed.categories) {
    const matchedSymbols = category.evidence.symbols.filter((symbol) => symbols.has(symbol));
    const matchedSelectors = category.evidence.selectors.filter((selector) =>
      selectors.has(selector),
    );
    if (matchedSymbols.length > 0 || matchedSelectors.length > 0) {
      detected.push({ category: category.type, matchedSymbols, matchedSelectors });
    }
  }
  return detected;
}
