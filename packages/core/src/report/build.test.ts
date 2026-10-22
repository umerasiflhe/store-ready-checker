import { describe, expect, it } from 'vitest';
import type { Finding } from '../rules/types.ts';
import { buildReport, sortFindings } from './build.ts';

function finding(overrides: Partial<Finding>): Finding {
  return {
    ruleId: 'IOS-TEST-001',
    severity: 'error',
    confidence: 'certain',
    title: 't',
    message: 'm',
    evidence: {},
    fix: [],
    sources: [],
    ...overrides,
  };
}

describe('sortFindings', () => {
  it('orders by severity: error, then warning, then info', () => {
    const sorted = sortFindings([
      finding({ ruleId: 'A', severity: 'info' }),
      finding({ ruleId: 'B', severity: 'error' }),
      finding({ ruleId: 'C', severity: 'warning' }),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(['error', 'warning', 'info']);
  });

  it('breaks ties by rule ID', () => {
    const sorted = sortFindings([
      finding({ ruleId: 'IOS-B-001', severity: 'error' }),
      finding({ ruleId: 'IOS-A-001', severity: 'error' }),
    ]);
    expect(sorted.map((f) => f.ruleId)).toEqual(['IOS-A-001', 'IOS-B-001']);
  });

  it('breaks further ties by location (evidence.bundle)', () => {
    const sorted = sortFindings([
      finding({ ruleId: 'IOS-A-001', severity: 'error', evidence: { bundle: 'Payload/B.app' } }),
      finding({ ruleId: 'IOS-A-001', severity: 'error', evidence: { bundle: 'Payload/A.app' } }),
    ]);
    expect(sorted.map((f) => f.evidence.bundle)).toEqual(['Payload/A.app', 'Payload/B.app']);
  });

  it('is a stable sort that does not mutate the input array', () => {
    const input = [finding({ ruleId: 'A' }), finding({ ruleId: 'B' })];
    const sorted = sortFindings(input);
    expect(sorted).not.toBe(input);
    expect(input.map((f) => f.ruleId)).toEqual(['A', 'B']);
  });
});

describe('buildReport', () => {
  const base = {
    tool: { name: 'store-ready', version: '1.0.0', rulesVersion: '2026.10.20' },
    asOf: '2026-10-20',
    input: { fileName: 'MyApp.ipa', sizeBytes: 123, kind: 'ipa' as const },
    app: { platform: 'ios' as const, id: 'com.example.app', version: '1.0', build: '1' },
  };

  it('derives status "blocked" when there is at least one error', () => {
    const report = buildReport({
      ...base,
      findings: [finding({ severity: 'error' }), finding({ severity: 'info' })],
    });
    expect(report.summary).toEqual({ status: 'blocked', errors: 1, warnings: 0, infos: 1 });
  });

  it('derives status "attention" when there are warnings but no errors', () => {
    const report = buildReport({ ...base, findings: [finding({ severity: 'warning' })] });
    expect(report.summary.status).toBe('attention');
  });

  it('derives status "ready" when there are no errors or warnings', () => {
    const report = buildReport({ ...base, findings: [finding({ severity: 'info' })] });
    expect(report.summary.status).toBe('ready');
  });

  it('derives status "ready" for an empty findings list', () => {
    const report = buildReport({ ...base, findings: [] });
    expect(report.summary).toEqual({ status: 'ready', errors: 0, warnings: 0, infos: 0 });
  });

  it('sorts the findings in the final report', () => {
    const report = buildReport({
      ...base,
      findings: [
        finding({ ruleId: 'B', severity: 'warning' }),
        finding({ ruleId: 'A', severity: 'error' }),
      ],
    });
    expect(report.findings.map((f) => f.ruleId)).toEqual(['A', 'B']);
  });
});
