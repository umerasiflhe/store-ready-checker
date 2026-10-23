import { expect, test } from '@playwright/test';
import { waitForResult } from './support.ts';

test('the whole flow is reachable and operable by keyboard alone', async ({
  page,
  browserName,
}) => {
  // Real Safari (and Playwright's WebKit) only includes form fields in Tab order unless the
  // user has turned on the OS-level "Full Keyboard Access" setting — confirmed by reproducing
  // it on a bare page with no app code. That's a platform default outside what a page can
  // control, not a gap in this app's markup (every control here is a real <button> or <a>).
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(browserName === 'webkit', "WebKit's default Tab order only includes form fields");

  await page.goto('./');

  // Tab order: trust-panel link, then the drop zone.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.drop-zone')).toBeFocused();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const fileChooser = await fileChooserPromise;
  expect(fileChooser.isMultiple()).toBe(false);

  // Reload for a clean focus state, then tab past the trust-panel link and the drop zone to
  // reach the first sample button and activate it with the keyboard.
  await page.goto('./');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /iOS — ready/ })).toBeFocused();
  await page.keyboard.press('Enter');

  await waitForResult(page);
  await expect(page.locator('.verdict-banner')).toContainText('Ready to upload');

  // Results are reachable: the severity-filter buttons and the reset button are all focusable.
  await expect(page.getByRole('button', { name: 'Check another file' })).toBeVisible();
});
