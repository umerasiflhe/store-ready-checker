import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixtureFilePath, waitForResult } from './support.ts';

test('idle state has no accessibility violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('result state has no accessibility violations', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Android — blocked/ }).click();
  await waitForResult(page);
  // Expand a finding so its contents are part of the scan too.
  await page.locator('.finding summary').click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('error state has no accessibility violations', async ({ page }) => {
  await page.goto('./');
  await page.locator('input[type=file]').setInputFiles(fixtureFilePath('ios-not-a-zip.ipa'));
  await page.locator('.error-panel').waitFor();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
