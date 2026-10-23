import { describe, expect, it } from 'vitest';
import type { Report } from '../packages/core/src/report/types.ts';
import { checkExpectations } from './check-real-build.ts';

function report(status: Report['summary']['status'], ruleIds: string[]): Report {
  return {
    summary: { status, errors: 0, warnings: 0, infos: 0 },
    findings: ruleIds.map((ruleId) => ({ ruleId })),
  } as unknown as Report;
}

describe('checkExpectations', () => {
  it('passes when the status and every expected rule match', () => {
    expect(
      checkExpectations(report('blocked', ['AND-TSDK-001', 'AND-16K-001']), {
        status: 'blocked',
        rules: ['AND-TSDK-001'],
      }),
    ).toEqual([]);
  });

  it('reports a wrong status and each missing rule', () => {
    expect(
      checkExpectations(report('ready', []), { status: 'attention', rules: ['AND-16K-001'] }),
    ).toEqual([
      'expected status attention, got ready',
      'expected a AND-16K-001 finding; none reported',
    ]);
  });

  it('checks nothing when nothing is expected', () => {
    expect(checkExpectations(report('blocked', ['X']), { rules: [] })).toEqual([]);
  });
});
