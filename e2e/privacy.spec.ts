import { expect, test } from '@playwright/test';
import { waitForResult } from './support.ts';

test('a full analysis session makes only same-origin static-asset GETs', async ({
  page,
  baseURL,
}) => {
  const requests: { url: string; method: string }[] = [];
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method() });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Android — blocked/ }).click();
  await waitForResult(page);

  // Exercise the asOf control too — the brief's whole point of the "reevaluate" message is that
  // it never adds a network request.
  await page.locator('input[type=date]').fill('2027-03-01');
  await page.locator('input[type=date]').dispatchEvent('change');
  await expect(page.locator('.verdict-banner')).toContainText('Blocked');

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.method).toBe('GET');
    expect(new URL(request.url).origin).toBe(new URL(baseURL ?? '').origin);
  }
});

test('the app works offline after the first load', async ({ page, context }) => {
  await page.goto('/');
  // Let the service worker finish installing and activating before going offline.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null;
  });

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /iOS — ready/ }).click();
  await waitForResult(page);
  await expect(page.locator('.verdict-banner')).toContainText('Ready to upload');

  await context.setOffline(false);
});
