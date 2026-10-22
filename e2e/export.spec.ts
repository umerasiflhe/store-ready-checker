import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Ajv2020Module from 'ajv/dist/2020.js';
import ajvFormatsDefault from 'ajv-formats';
import type { FormatsPlugin } from 'ajv-formats';
import { expect, test } from '@playwright/test';
import { waitForResult } from './support.ts';

const Ajv2020 = Ajv2020Module.Ajv2020;
const addFormats = ajvFormatsDefault as unknown as FormatsPlugin;

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schema = JSON.parse(
  readFileSync(join(repoRoot, 'schema/report.schema.json'), 'utf8'),
) as Record<string, unknown>;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateReport = ajv.compile(schema);

test('download JSON produces a report that validates against the schema', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Android — ready/ }).click();
  await waitForResult(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  // Fail fast with a clear message if Playwright didn't save the download to disk.
  // eslint-disable-next-line playwright/no-conditional-in-test
  if (!path) throw new Error('download did not save to disk');

  const report = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const valid = validateReport(report);
  expect(valid, JSON.stringify(validateReport.errors ?? [])).toBe(true);
  expect(download.suggestedFilename()).toContain('.report.json');
});

test('copy as Markdown puts a readable report on the clipboard', async ({
  page,
  context,
  browserName,
}) => {
  // Only Chromium supports granting the clipboard-read permission via the CDP-based API below;
  // Firefox and WebKit have their own (unautomatable in CI) permission prompts.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(browserName !== 'chromium', 'clipboard-read can only be granted on Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');
  await page.getByRole('button', { name: /Android — blocked/ }).click();
  await waitForResult(page);

  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

  expect(clipboardText).toContain('# Store Ready report');
  expect(clipboardText).toContain('AND-16K-001');
  expect(clipboardText).toContain('## Findings');
});
