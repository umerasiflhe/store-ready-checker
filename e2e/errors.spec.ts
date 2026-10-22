import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixtureFilePath } from './support.ts';

test('a non-zip file produces the not-a-zip error state', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixtureFilePath('ios-not-a-zip.ipa'));
  await expect(page.locator('.error-panel')).toContainText("isn't a valid zip archive");
});

test('an empty file produces an error state', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'empty.ipa',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(0),
  });
  await expect(page.locator('.error-panel')).toBeVisible();
});

test('a valid zip with a recognized extension but no manifest produces the corrupted error state', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles(fixtureFilePath('android-apk-no-manifest.apk'));
  await expect(page.locator('.error-panel')).toContainText("couldn't make sense of what's inside");
});

test('a valid zip with no recognizable extension or manifest produces the unsupported-kind error state', async ({
  page,
}) => {
  await page.goto('/');
  // Same bytes as ios-no-payload.ipa (a zip with only a README.txt entry), but under a name
  // with no recognized extension, so kind detection must fall through every entry-peek check.
  await page.locator('input[type=file]').setInputFiles({
    name: 'mystery-upload.bin',
    mimeType: 'application/octet-stream',
    buffer: readFileSync(fixtureFilePath('ios-no-payload.ipa')),
  });
  await expect(page.locator('.error-panel')).toContainText(
    "doesn't look like an .ipa, .aab, or .apk",
  );
});
