// Renders the web app's PNG icons and its Open Graph image from apps/web/public/icon.svg and an
// inline HTML template, using Playwright's Chromium (already a dev dependency) — no network, no
// fonts beyond the system stack the app itself uses.
//
//   npx tsx scripts/gen-images.ts
//
// The PNGs are committed. Chromium's rasterising differs slightly between operating systems, so
// there's no freshness check: rerun this after changing icon.svg or the template below.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(repoRoot, 'apps/web/public');

const BACKGROUND = '#0b0d10';
const ACCENT = '#4ade80';
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The drawing inside icon.svg (its `<path>` elements), without the rounded background. */
export function iconPaths(svg: string): string {
  const paths = svg.match(/<path\b[\s\S]*?\/>/g);
  if (!paths || paths.length === 0) throw new Error('icon.svg has no <path> elements');
  return paths.join('\n');
}

/**
 * A square, full-bleed icon: a solid background (iOS and Android mask their own corners) with
 * the drawing scaled to `contentScale` of the 64-unit canvas and centred. Maskable icons keep
 * their content inside the central 80% safe zone.
 */
export function squareIconSvg(paths: string, contentScale: number): string {
  const offset = Number(((64 * (1 - contentScale)) / 2).toFixed(3));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BACKGROUND}" />
  <g transform="translate(${String(offset)} ${String(offset)}) scale(${String(contentScale)})">
${paths}
  </g>
</svg>`;
}

export function ogImageHtml(iconSvg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; background: ${BACKGROUND}; }
  body { font-family: ${FONT_SANS}; color: #e7eaee; display: flex; flex-direction: column;
         justify-content: center; padding: 0 96px; box-sizing: border-box; }
  .brand { display: flex; align-items: center; gap: 32px; }
  .brand svg { width: 128px; height: 128px; }
  h1 { font-size: 96px; margin: 0; letter-spacing: -2px; }
  p { font-size: 40px; line-height: 1.3; margin: 40px 0 0; color: #c9d1db; max-width: 980px; }
  .chips { display: flex; gap: 20px; margin-top: 44px; }
  .chip { font-size: 28px; padding: 10px 22px; border-radius: 999px; border: 2px solid #2b313a; }
  .chip.accent { border-color: ${ACCENT}; color: ${ACCENT}; }
  footer { position: absolute; bottom: 40px; left: 96px; font-size: 24px; color: #9aa4b2;
           display: flex; flex-direction: column; gap: 4px; white-space: nowrap; }
</style></head><body>
  <div class="brand">${iconSvg}<h1>Store Ready</h1></div>
  <p>Will App Store Connect or Google Play reject your build? Find out before you upload.</p>
  <div class="chips">
    <span class="chip">.ipa · .aab · .apk</span>
    <span class="chip accent">Runs in your browser: nothing is uploaded</span>
  </div>
  <footer><span>umerasiflhe.github.io/store-ready-checker</span>
    <span>Free and open source · Not affiliated with Apple or Google</span></footer>
</body></html>`;
}

async function renderSvg(page: Page, svg: string, size: number, out: string): Promise<void> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${svg.replace(
      '<svg ',
      `<svg width="${String(size)}" height="${String(size)}" style="display:block" `,
    )}</body></html>`,
  );
  await page.screenshot({ path: out, omitBackground: true });
  console.log(`wrote ${out}`);
}

async function main(): Promise<void> {
  const iconSvg = readFileSync(join(publicDir, 'icon.svg'), 'utf8');
  const paths = iconPaths(iconSvg);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    // Block every request: the templates are self-contained, and nothing may be fetched.
    await page.route('**/*', (route) => route.abort());

    await renderSvg(page, iconSvg, 192, join(publicDir, 'icon-192.png'));
    await renderSvg(page, iconSvg, 512, join(publicDir, 'icon-512.png'));
    await renderSvg(page, squareIconSvg(paths, 0.8), 512, join(publicDir, 'icon-maskable-512.png'));
    await renderSvg(page, squareIconSvg(paths, 0.9), 180, join(publicDir, 'apple-touch-icon.png'));

    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(ogImageHtml(iconSvg));
    const ogPath = join(publicDir, 'og-image.png');
    await page.screenshot({ path: ogPath });
    console.log(`wrote ${ogPath}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
