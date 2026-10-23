// Records the README's web demo: load the app, try the "Android — blocked" sample, open its
// AND-16K-001 finding, then move "Check as of" past 2027-02-01 and watch it become an error.
// Playwright records a video into docs/media/raw/ (gitignored); ffmpeg turns it into
// docs/media/web-demo.gif with a two-pass palette, 800 px wide.
//
//   npm run build && npm run preview          # in one terminal
//   npx tsx scripts/record-demo/web.ts        # in another (BASE_URL overrides the preview URL)
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = join(repoRoot, 'docs/media/raw');
const gifPath = join(repoRoot, 'docs/media/web-demo.gif');
const baseURL = process.env.BASE_URL ?? 'http://localhost:4173/store-ready-checker/';
const size = { width: 800, height: 760 };
const MAX_GIF_BYTES = 4 * 1024 * 1024;

async function recordVideo(): Promise<string> {
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: size,
      colorScheme: 'dark',
      recordVideo: { dir: rawDir, size },
    });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: /Android — blocked/ }).click();
    await page.locator('.verdict-banner').waitFor();
    await page.waitForTimeout(1800);

    await page.locator('.finding summary').first().click();
    await page.waitForTimeout(2500);

    const dateInput = page.locator('input[type=date]');
    await dateInput.scrollIntoViewIfNeeded();
    // Chromium shows the date in the OS region's order, so pick a day that reads the same
    // either way (15/02 or 02/15), past the 2027-02-01 boundary.
    await dateInput.fill('2027-02-15');
    await dateInput.dispatchEvent('change');
    await page.locator('.verdict-banner', { hasText: 'Blocked' }).waitFor();
    await page.waitForTimeout(1500);
    // Re-evaluating re-renders the report, so open the (now error) finding again.
    await page.locator('.finding summary').first().click();
    await page.waitForTimeout(3500);

    const video = page.video();
    await context.close();
    if (!video) throw new Error('Playwright did not record a video');
    return await video.path();
  } finally {
    await browser.close();
  }
}

function toGif(videoPath: string): void {
  const palette = join(rawDir, 'palette.png');
  const filters = 'fps=12,scale=800:-1:flags=lanczos';
  const run = (args: string[]): void => {
    const result = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed`);
  };
  run(['-i', videoPath, '-vf', `${filters},palettegen=stats_mode=diff`, palette]);
  run([
    '-i',
    videoPath,
    '-i',
    palette,
    '-lavfi',
    `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    gifPath,
  ]);
  const bytes = statSync(gifPath).size;
  if (bytes > MAX_GIF_BYTES) {
    throw new Error(`${gifPath} is ${String(bytes)} bytes; the README budget is 4 MB`);
  }
  console.log(`wrote ${gifPath} (${String(Math.round(bytes / 1024))} KB)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  toGif(await recordVideo());
}
