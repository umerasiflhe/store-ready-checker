import { describe, expect, it } from 'vitest';
import type { Finding } from '../rules/types.ts';
import type { Report } from './types.ts';
import { reportToMarkdown } from './markdown.ts';

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

function report(overrides: Partial<Report>): Report {
  return {
    tool: { name: 'store-ready', version: '1.0.0', rulesVersion: '2026.10.20' },
    asOf: '2026-10-20',
    input: { fileName: 'MyApp.ipa', sizeBytes: 123, kind: 'ipa' },
    app: { platform: 'ios', id: 'com.example.app', version: '1.0', build: '1' },
    summary: { status: 'ready', errors: 0, warnings: 0, infos: 0 },
    findings: [],
    ...overrides,
  };
}

describe('reportToMarkdown', () => {
  it('renders the file name, status and counts', () => {
    const markdown = reportToMarkdown(
      report({
        summary: { status: 'blocked', errors: 1, warnings: 0, infos: 0 },
        findings: [finding({ severity: 'error' })],
      }),
    );
    expect(markdown).toContain('# Store Ready report — MyApp.ipa');
    expect(markdown).toContain('Blocked');
    expect(markdown).toContain('1 error(s)');
  });

  it('renders a ready report with no findings section', () => {
    const markdown = reportToMarkdown(report({}));
    expect(markdown).not.toContain('## Findings');
    expect(markdown).toContain('Ready');
  });

  it('renders evidence as a table, fix steps as a list, and sources as links', () => {
    const markdown = reportToMarkdown(
      report({
        summary: { status: 'blocked', errors: 1, warnings: 0, infos: 0 },
        findings: [
          finding({
            evidence: { bundle: 'Payload/MyApp.app', DTXcode: '1640' },
            fix: ['Install Xcode 26', 'Re-export'],
            sources: [{ title: 'Apple docs', url: 'https://example.com/docs' }],
          }),
        ],
      }),
    );
    expect(markdown).toContain('| bundle | Payload/MyApp.app |');
    expect(markdown).toContain('| DTXcode | 1640 |');
    expect(markdown).toContain('- Install Xcode 26');
    expect(markdown).toContain('[Apple docs](https://example.com/docs)');
  });

  it('marks heuristic findings', () => {
    const markdown = reportToMarkdown(
      report({
        summary: { status: 'blocked', errors: 1, warnings: 0, infos: 0 },
        findings: [finding({ confidence: 'heuristic' })],
      }),
    );
    expect(markdown).toContain('_(heuristic)_');
  });

  it('renders non-string and array evidence values', () => {
    const markdown = reportToMarkdown(
      report({
        summary: { status: 'blocked', errors: 1, warnings: 0, infos: 0 },
        findings: [finding({ evidence: { count: 3, abis: ['arm64-v8a', 'x86_64'] } })],
      }),
    );
    expect(markdown).toContain('| count | 3 |');
    expect(markdown).toContain('| abis | arm64-v8a, x86_64 |');
  });

  it('escapes pipe characters in evidence so the table stays well-formed', () => {
    const markdown = reportToMarkdown(
      report({
        summary: { status: 'blocked', errors: 1, warnings: 0, infos: 0 },
        findings: [finding({ evidence: { note: 'a | b' } })],
      }),
    );
    expect(markdown).toContain('a \\| b');
  });

  it('is deterministic for the same input', () => {
    const r = report({
      summary: { status: 'attention', errors: 0, warnings: 1, infos: 0 },
      findings: [finding({ severity: 'warning' })],
    });
    expect(reportToMarkdown(r)).toEqual(reportToMarkdown(r));
  });
});
