import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function expectedReportPath(name: string): string {
  return join(repoRoot, 'fixtures/expected', `${name}.json`);
}

export function fixtureFilePath(name: string): string {
  return join(repoRoot, 'fixtures/files', name);
}

export function loadExpectedReport(name: string): Record<string, unknown> {
  const golden = JSON.parse(readFileSync(expectedReportPath(name), 'utf8')) as {
    ok: boolean;
    value: Record<string, unknown>;
  };
  if (!golden.ok) {
    throw new Error(`${name} is an "ok: false" golden fixture, not a report`);
  }
  return golden.value;
}

export async function waitForResult(page: Page): Promise<void> {
  await page.locator('.verdict-banner').waitFor();
}
