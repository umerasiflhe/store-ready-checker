import { expect, test } from '@playwright/test';

// Link previews and home-screen icons: every image the page points to is a same-origin static
// asset that the build actually serves (the og:image URL is absolute because link-preview
// crawlers need that, but it names this same deployment).
test('the Open Graph image and app icons are served by this deployment', async ({
  page,
  request,
}) => {
  await page.goto('./');

  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://umerasiflhe.github.io/store-ready-checker/og-image.png',
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );

  const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (
    await request.get(new URL(manifestHref ?? '', page.url()).href)
  ).json()) as {
    icons: { src: string; type: string }[];
  };

  const images = [
    { path: 'og-image.png', type: 'image/png' },
    { path: appleTouchIcon ?? '', type: 'image/png' },
    ...manifest.icons.map((icon) => ({ path: icon.src, type: icon.type })),
  ];
  expect(manifest.icons.map((icon) => icon.src)).toEqual(
    expect.arrayContaining(['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']),
  );
  for (const image of images) {
    const url = new URL(image.path, page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    const response = await request.get(url.href);
    expect(response.status(), url.href).toBe(200);
    expect(response.headers()['content-type'], url.href).toContain(image.type);
  }
});
