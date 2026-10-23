import { describe, expect, it } from 'vitest';
import { buildFinding, resolveTimelineSeverity } from './engine.ts';
import type { Rule } from './types.ts';

describe('resolveTimelineSeverity', () => {
  const timeline = [
    { from: '2025-11-01', severity: 'warning' as const, note: undefined, formFactors: undefined },
    { from: '2027-02-01', severity: 'error' as const, note: undefined, formFactors: undefined },
  ];

  it('returns an info "becomes required" result before the earliest entry', () => {
    expect(resolveTimelineSeverity(timeline, '2025-10-31')).toEqual({
      severity: 'info',
      note: undefined,
      becomesRequiredOn: '2025-11-01',
    });
  });

  it('is active on the exact day of the first transition', () => {
    expect(resolveTimelineSeverity(timeline, '2025-11-01')).toEqual({
      severity: 'warning',
      note: undefined,
      becomesRequiredOn: undefined,
    });
  });

  it('stays at the first severity the day before the second transition', () => {
    expect(resolveTimelineSeverity(timeline, '2027-01-31')).toEqual({
      severity: 'warning',
      note: undefined,
      becomesRequiredOn: undefined,
    });
  });

  it('switches severity exactly on the second transition date', () => {
    expect(resolveTimelineSeverity(timeline, '2027-02-01')).toEqual({
      severity: 'error',
      note: undefined,
      becomesRequiredOn: undefined,
    });
  });

  it('stays at the final severity the day after the second transition', () => {
    expect(resolveTimelineSeverity(timeline, '2027-02-02')).toEqual({
      severity: 'error',
      note: undefined,
      becomesRequiredOn: undefined,
    });
  });

  it('is order-independent: an unsorted timeline resolves the same way', () => {
    const reversed = [...timeline].reverse();
    expect(resolveTimelineSeverity(reversed, '2026-01-01')).toEqual(
      resolveTimelineSeverity(timeline, '2026-01-01'),
    );
  });

  it('carries a note from the active entry', () => {
    const withNote = [
      {
        from: '2026-08-31',
        severity: 'error' as const,
        note: 'extension until 2026-11-01',
        formFactors: undefined,
      },
    ];
    expect(resolveTimelineSeverity(withNote, '2026-09-01').note).toBe('extension until 2026-11-01');
  });

  describe('form-factor-restricted entries', () => {
    const withTv = [
      ...timeline,
      { from: '2026-08-01', severity: 'error' as const, note: undefined, formFactors: ['tv'] },
    ];

    it('apply from their date to the listed form factors', () => {
      expect(resolveTimelineSeverity(withTv, '2026-07-31', 'tv').severity).toBe('warning');
      expect(resolveTimelineSeverity(withTv, '2026-08-01', 'tv').severity).toBe('error');
    });

    it('are ignored for other form factors and when no form factor is given', () => {
      expect(resolveTimelineSeverity(withTv, '2026-08-01', 'phone_tablet').severity).toBe(
        'warning',
      );
      expect(resolveTimelineSeverity(withTv, '2026-08-01').severity).toBe('warning');
    });

    it('count towards "becomes required" only for the listed form factors', () => {
      const tvOnly = [
        { from: '2026-08-01', severity: 'error' as const, note: undefined, formFactors: ['tv'] },
        { from: '2027-02-01', severity: 'error' as const, note: undefined, formFactors: undefined },
      ];
      expect(resolveTimelineSeverity(tvOnly, '2026-01-01', 'tv').becomesRequiredOn).toBe(
        '2026-08-01',
      );
      expect(resolveTimelineSeverity(tvOnly, '2026-01-01', 'wear').becomesRequiredOn).toBe(
        '2027-02-01',
      );
    });
  });
});

describe('buildFinding', () => {
  const rule: Rule = {
    id: 'IOS-TEST-001',
    platform: 'ios',
    title: 'Test rule',
    confidence: undefined,
    appliesWhen: undefined,
    parameters: undefined,
    timeline: [{ from: '2026-01-01', severity: 'error', note: undefined, formFactors: undefined }],
    sources: [{ title: 'Apple docs', url: 'https://developer.apple.com/x' }],
    fix: ['Do the thing'],
  };

  it('defaults confidence to certain when the rule does not override it', () => {
    const resolved = resolveTimelineSeverity(rule.timeline, '2026-06-01');
    const finding = buildFinding(rule, resolved, { title: 't', message: 'm', evidence: {} });
    expect(finding.confidence).toBe('certain');
    expect(finding.severity).toBe('error');
    expect(finding.ruleId).toBe('IOS-TEST-001');
    expect(finding.sources).toEqual(rule.sources);
    expect(finding.fix).toEqual(rule.fix);
  });

  it('uses the rule confidence override when present', () => {
    const heuristicRule: Rule = { ...rule, confidence: 'heuristic' };
    const resolved = resolveTimelineSeverity(heuristicRule.timeline, '2026-06-01');
    const finding = buildFinding(heuristicRule, resolved, {
      title: 't',
      message: 'm',
      evidence: {},
    });
    expect(finding.confidence).toBe('heuristic');
  });

  it('appends the "becomes required on" date to the message when not yet in force', () => {
    const resolved = resolveTimelineSeverity(rule.timeline, '2025-01-01');
    const finding = buildFinding(rule, resolved, {
      title: 't',
      message: 'Base message.',
      evidence: {},
    });
    expect(finding.severity).toBe('info');
    expect(finding.message).toBe('Base message. Becomes required on 2026-01-01.');
  });
});
