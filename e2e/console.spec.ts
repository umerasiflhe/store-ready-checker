import { expect, test } from '@playwright/test';
import { waitForResult } from './support.ts';

// WebKit raises a style-src-attr/"inline" CSP violation merely from rendering a native
// <input type="date"> or <select> under a CSP without 'unsafe-inline' — reproduced with a
// bare <input type="date"> and no app code at all, so it's a WebKit engine quirk, not something
// our code can trigger or avoid. Everything else still fails the test.
function isWebkitNativeFormControlNoise(text: string, browserName: string): boolean {
  return (
    browserName === 'webkit' &&
    (text.includes(
      "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'",
    ) ||
      text.includes('style-src-attr') ||
      text.includes('blocked inline'))
  );
}

test('a full analysis session produces no console errors or CSP violations', async ({
  page,
  browserName,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error)}`));

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  await page.goto('/');

  await page.getByRole('button', { name: /Android — blocked/ }).click();
  await waitForResult(page);
  await page.getByRole('button', { name: 'Check another file' }).click();

  const realProblems = problems.filter(
    (problem) => !isWebkitNativeFormControlNoise(problem, browserName),
  );
  expect(realProblems).toEqual([]);
});
