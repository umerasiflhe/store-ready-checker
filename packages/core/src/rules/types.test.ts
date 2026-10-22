import { describe, expect, it } from 'vitest';
import { parseRulesFile } from './types.ts';

const VALID = {
  rulesVersion: '2026.10.20',
  rules: [
    {
      id: 'IOS-MINOS-001',
      platform: 'ios',
      title: 'MinimumOSVersion must be at least 13.0',
      parameters: { minimumOSVersion: '13.0' },
      timeline: [{ from: '2026-09-09', severity: 'error', note: 'extension note' }],
      sources: [{ title: 'Apple', url: 'https://developer.apple.com/x', retrieved: '2026-10-20' }],
      fix: ['Raise the deployment target'],
    },
  ],
};

describe('parseRulesFile', () => {
  it('parses a valid rules file', () => {
    const result = parseRulesFile(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rulesVersion).toBe('2026.10.20');
    expect(result.value.rules).toHaveLength(1);
    expect(result.value.rules[0]).toEqual({
      id: 'IOS-MINOS-001',
      platform: 'ios',
      title: 'MinimumOSVersion must be at least 13.0',
      confidence: undefined,
      appliesWhen: undefined,
      parameters: { minimumOSVersion: '13.0' },
      timeline: [{ from: '2026-09-09', severity: 'error', note: 'extension note' }],
      sources: [{ title: 'Apple', url: 'https://developer.apple.com/x' }],
      fix: ['Raise the deployment target'],
    });
  });

  it('parses an explicit confidence override', () => {
    const data = {
      ...VALID,
      rules: [{ ...VALID.rules[0], confidence: 'heuristic' }],
    };
    const result = parseRulesFile(data);
    expect(result.ok && result.value.rules[0]?.confidence).toBe('heuristic');
  });

  it('returns a typed error, never throws, for malformed data', () => {
    expect(parseRulesFile(null).ok).toBe(false);
    expect(parseRulesFile({}).ok).toBe(false);
    expect(parseRulesFile({ rulesVersion: '2026.10.20', rules: [{}] }).ok).toBe(false);
    expect(
      parseRulesFile({
        rulesVersion: '2026.10.20',
        rules: [{ ...VALID.rules[0], platform: 'windows' }],
      }).ok,
    ).toBe(false);
    expect(
      parseRulesFile({
        rulesVersion: '2026.10.20',
        rules: [{ ...VALID.rules[0], timeline: [{ from: '2026-01-01', severity: 'critical' }] }],
      }).ok,
    ).toBe(false);
  });
});
