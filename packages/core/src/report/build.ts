import type { Finding, Severity } from '../rules/types.ts';
import type { Report, ReportApp, ReportInput, ReportTool } from './types.ts';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function locationOf(finding: Finding): string {
  const bundle = finding.evidence.bundle;
  return typeof bundle === 'string' ? bundle : '';
}

/** Sorted by severity (error, then warning, then info), then rule ID, then location. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    if (a.ruleId !== b.ruleId) {
      return a.ruleId < b.ruleId ? -1 : 1;
    }
    const locationA = locationOf(a);
    const locationB = locationOf(b);
    if (locationA === locationB) {
      return 0;
    }
    return locationA < locationB ? -1 : 1;
  });
}

export interface BuildReportParams {
  readonly tool: ReportTool;
  readonly asOf: string;
  readonly input: ReportInput;
  readonly app: ReportApp;
  readonly findings: readonly Finding[];
}

export function buildReport(params: BuildReportParams): Report {
  const findings = sortFindings(params.findings);
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const infos = findings.filter((finding) => finding.severity === 'info').length;
  const status = errors > 0 ? 'blocked' : warnings > 0 ? 'attention' : 'ready';
  return {
    tool: params.tool,
    asOf: params.asOf,
    input: params.input,
    app: params.app,
    summary: { status, errors, warnings, infos },
    findings,
  };
}
