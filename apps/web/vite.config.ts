import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: import.meta.dirname,
  base: '/store-ready-checker/',
  envDir: '../../',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'robots.txt'],
      manifest: {
        name: 'Store Ready',
        short_name: 'Store Ready',
        description:
          'Check an iOS or Android build against current App Store Connect and Google Play upload rules, entirely in your browser.',
        start_url: '/store-ready-checker/',
        scope: '/store-ready-checker/',
        display: 'standalone',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Same-origin build output only — nothing third-party is ever precached (hard constraint 1).
        // og-image.png is only for link previews, so it's left out of the precache.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['og-image.png'],
      },
    }),
  ],
});
