import { expect, test } from '@playwright/test';
import { ensureLargeIpa } from '../fixtures/generators/large-ipa.ts';
import { waitForResult } from './support.ts';

test('a 500 MB synthetic IPA is analysed in under 10 seconds', async ({ page }, testInfo) => {
  // Brief §6.5 only budgets this for a desktop Chromium CI runner — not the mobile-chrome
  // project, which also reports browserName "chromium" but emulates a far less capable device.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(testInfo.project.name !== 'chromium', 'only budgeted for the desktop chromium project');
  test.slow();

  const largeIpaPath = await ensureLargeIpa();

  await page.goto('./');
  const start = Date.now();
  await page.locator('input[type=file]').setInputFiles(largeIpaPath);
  await waitForResult(page);
  const elapsedMs = Date.now() - start;

  expect(elapsedMs).toBeLessThan(10_000);
});
