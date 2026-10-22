import type { Finding, Severity } from '../rules/types.ts';
import type { Report, ReportStatus } from './types.ts';

const STATUS_LABEL: Record<ReportStatus, string> = {
  blocked: '🚫 Blocked',
  attention: '⚠️ Needs attention',
  ready: '✅ Ready',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: '❌ Error',
  warning: '⚠️ Warning',
  info: 'ℹ️ Info',
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatEvidenceValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatEvidenceValue(item)).join(', ');
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function findingToMarkdown(finding: Finding): string {
  const lines: string[] = [];
  const heuristicBadge = finding.confidence === 'heuristic' ? ' _(heuristic)_' : '';
  lines.push(
    `### ${SEVERITY_LABEL[finding.severity]} · \`${finding.ruleId}\` — ${finding.title}${heuristicBadge}`,
  );
  lines.push('');
  lines.push(finding.message);

  const evidenceEntries = Object.entries(finding.evidence);
  if (evidenceEntries.length > 0) {
    lines.push('');
    lines.push('| Evidence | Value |');
    lines.push('| --- | --- |');
    for (const [key, value] of evidenceEntries) {
      lines.push(`| ${escapeCell(key)} | ${escapeCell(formatEvidenceValue(value))} |`);
    }
  }

  if (finding.fix.length > 0) {
    lines.push('');
    lines.push('**Fix:**');
    for (const step of finding.fix) {
      lines.push(`- ${step}`);
    }
  }

  if (finding.sources.length > 0) {
    lines.push('');
    lines.push('**Sources:**');
    for (const source of finding.sources) {
      lines.push(`- [${source.title}](${source.url})`);
    }
  }

  return lines.join('\n');
}

/** Renders a report as GitHub-Flavored Markdown, for the web app's "copy as Markdown" action and
 * the CLI's future `--format markdown` output. Deterministic: same input always produces the
 * same string, since `findings` is already sorted by `buildReport`. */
export function reportToMarkdown(report: Report): string {
  const { tool, asOf, input, app, summary, findings } = report;
  const lines: string[] = [];

  lines.push(`# Store Ready report — ${input.fileName}`);
  lines.push('');
  lines.push(
    `**${STATUS_LABEL[summary.status]}** · ${String(summary.errors)} error(s) · ${String(summary.warnings)} warning(s) · ${String(summary.infos)} info`,
  );
  lines.push('');
  lines.push(`- **Checked as of:** ${asOf}`);
  lines.push(`- **Tool:** ${tool.name} ${tool.version} · rules ${tool.rulesVersion}`);
  lines.push(`- **Platform:** ${app.platform}`);
  if (app.id || app.version || app.build) {
    lines.push(`- **App:** ${app.id} v${app.version} (build ${app.build})`);
  }
  lines.push(`- **File:** ${input.fileName} (${String(input.sizeBytes)} bytes, ${input.kind})`);

  if (findings.length > 0) {
    lines.push('');
    lines.push('## Findings');
    for (const finding of findings) {
      lines.push('');
      lines.push(findingToMarkdown(finding));
    }
  }

  lines.push('');
  lines.push('_Not affiliated with Apple or Google._');

  return lines.join('\n');
}
