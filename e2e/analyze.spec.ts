import { expect, test } from '@playwright/test';
import { fixtureFilePath, loadExpectedReport, waitForResult } from './support.ts';

interface ExpectedFinding {
  readonly title: string;
  readonly evidence: Record<string, unknown>;
  readonly fix: readonly string[];
}

function firstFinding(name: string): ExpectedFinding {
  const findings = loadExpectedReport(name).findings as ExpectedFinding[];
  const finding = findings[0];
  if (!finding) throw new Error(`${name} has no findings`);
  return finding;
}

const androidReadyFinding = firstFinding('android-aab-passing');
const androidBlockedFinding = firstFinding('android-aab-16k-load-misaligned-warning');

test.describe('analyzing a build', () => {
  test('the iOS ready sample shows a ready verdict with no findings', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /iOS — ready/ }).click();
    await waitForResult(page);

    await expect(page.locator('.verdict-banner')).toContainText('Ready to upload');
    await expect(page.locator('.finding')).toHaveCount(0);
  });

  test('the Android ready sample shows the AND-INFO-001 info finding', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Android — ready/ }).click();
    await waitForResult(page);

    await expect(page.locator('.verdict-banner')).toContainText('Ready to upload');
    await expect(page.locator('.finding')).toHaveCount(1);
    await expect(page.locator('.finding')).toHaveAttribute('data-severity', 'info');
    await page.locator('.finding summary').click();
    await expect(page.locator('.finding')).toContainText(androidReadyFinding.title);
  });

  test('the Android blocked sample shows the AND-16K-001 finding with evidence and a fix', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Android — blocked/ }).click();
    await waitForResult(page);

    await expect(page.locator('.verdict-banner')).toContainText('Needs attention');
    const findingEl = page.locator('.finding');
    await findingEl.locator('summary').click();
    await expect(findingEl).toContainText(androidBlockedFinding.title);
    await expect(findingEl).toContainText(String(androidBlockedFinding.evidence.abi));
    for (const step of androidBlockedFinding.fix) {
      await expect(findingEl).toContainText(step);
    }
  });

  test('dropping a real fixture file from disk via the file input works the same way', async ({
    page,
  }) => {
    await page.goto('./');
    await page.locator('input[type=file]').setInputFiles(fixtureFilePath('ios-passing-app.ipa'));
    await waitForResult(page);
    await expect(page.locator('.verdict-banner')).toContainText('Ready to upload');
  });

  test('"Check another file" returns to the idle drop zone', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /iOS — ready/ }).click();
    await waitForResult(page);
    await page.getByRole('button', { name: 'Check another file' }).click();
    await expect(page.locator('.drop-zone')).toBeVisible();
  });
});
