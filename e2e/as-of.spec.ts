import { expect, test } from '@playwright/test';
import { waitForResult } from './support.ts';

test('changing "Check as of" flips the 16K finding across the 2027-02-01 boundary', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Android — blocked/ }).click();
  await waitForResult(page);

  const dateInput = page.locator('input[type=date]');
  const finding = page.locator('.finding');

  await dateInput.fill('2027-01-31');
  await dateInput.dispatchEvent('change');
  await expect(page.locator('.verdict-banner')).toContainText('Needs attention');
  await expect(finding).toHaveAttribute('data-severity', 'warning');

  await dateInput.fill('2027-02-01');
  await dateInput.dispatchEvent('change');
  await expect(page.locator('.verdict-banner')).toContainText('Blocked');
  await expect(finding).toHaveAttribute('data-severity', 'error');
});
