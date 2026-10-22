import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173/store-ready-checker/',
    trace: 'on-first-retry',
  },
  // The offline/PWA test needs a real, built service worker, so e2e always runs against a
  // production build served statically — never the dev server. Skipped entirely when BASE_URL
  // points at an already-running deployment (the post-deploy smoke test, brief §7.5).
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run preview',
          url: 'http://localhost:4173/store-ready-checker/',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
