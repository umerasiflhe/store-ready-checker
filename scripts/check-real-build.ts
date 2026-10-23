// Checks a real Xcode/Gradle artifact built by .github/workflows/real-builds.yml (brief §7.6)
// with the TS core — and, given --swift, the Swift CLI — and asserts the expected outcome.
//
//   npx tsx scripts/check-real-build.ts <file> [--as-of YYYY-MM-DD]
//       [--expect-status ready|attention|blocked] [--expect-rule RULE-ID]... [--swift <storeready>]
//
// Exit 0 when every expectation holds (and, with --swift, both implementations agree).
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { Report } from '../packages/core/src/report/types.ts';
import { analyzeWithCore, loadRuleData, normalizeReport, runSwiftCli } from './lib/core-report.ts';

export interface Expectations {
  readonly status?: string | undefined;
  readonly rules: readonly string[];
}

/** Every way `report` misses `expected`; empty when it meets them all. */
export function checkExpectations(report: Report, expected: Expectations): string[] {
  const problems: string[] = [];
  if (expected.status !== undefined && report.summary.status !== expected.status) {
    problems.push(`expected status ${expected.status}, got ${report.summary.status}`);
  }
  const found = new Set(report.findings.map((finding) => finding.ruleId));
  for (const rule of expected.rules) {
    if (!found.has(rule)) problems.push(`expected a ${rule} finding; none reported`);
  }
  return problems;
}

function argValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  argv.forEach((arg, index) => {
    const value = argv[index + 1];
    if (arg === flag && value !== undefined) values.push(value);
  });
  return values;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const filePath = argv[0];
  if (filePath === undefined || filePath.startsWith('--')) {
    console.error('usage: check-real-build.ts <file> [--expect-status s] [--expect-rule ID]...');
    process.exit(2);
  }
  const asOf = argValues(argv, '--as-of')[0] ?? new Date().toISOString().slice(0, 10);
  const expected: Expectations = {
    status: argValues(argv, '--expect-status')[0],
    rules: argValues(argv, '--expect-rule'),
  };
  const swift = argValues(argv, '--swift')[0];
  const fileName = basename(filePath);

  const result = await analyzeWithCore(
    new Blob([Uint8Array.from(readFileSync(filePath))]),
    fileName,
    asOf,
    loadRuleData(),
  );
  if (!result.ok) {
    console.error(`${fileName}: TS core could not analyse it (${result.error.code})`);
    process.exit(1);
  }
  const report = result.value;
  const ruleIds = report.findings.map((finding) => `${finding.ruleId} (${finding.severity})`);
  console.log(`${fileName} as of ${asOf}: ${report.summary.status}`);
  console.log(`  app: ${report.app.id} ${report.app.version} (${report.app.build})`);
  console.log(`  findings: ${ruleIds.length > 0 ? ruleIds.join(', ') : 'none'}`);

  const problems = checkExpectations(report, expected);

  if (swift !== undefined) {
    const cli = runSwiftCli(filePath, asOf, swift);
    try {
      const cliReport = JSON.parse(cli.stdout) as Report;
      if (!isDeepStrictEqual(normalizeReport(report), normalizeReport(cliReport))) {
        problems.push(
          `TS core and Swift CLI disagree:\n  TS:    ${JSON.stringify(normalizeReport(report))}\n` +
            `  Swift: ${JSON.stringify(normalizeReport(cliReport))}`,
        );
      } else {
        console.log('  Swift CLI: identical report');
      }
    } catch {
      problems.push(`Swift CLI exited ${String(cli.status)} without JSON: ${cli.stdout}`);
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== '') {
    const outcome = problems.length === 0 ? '✅' : '❌';
    appendFileSync(
      summaryPath,
      `| ${outcome} | \`${fileName}\` | ${report.summary.status} | ${ruleIds.join(', ') || '—'} |\n`,
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
