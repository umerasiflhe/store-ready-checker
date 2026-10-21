# Privacy

Store Ready is designed so your app build never leaves your device.

## What runs where

- **Web app**: your file is read by a Web Worker inside your own browser tab. The worker reads the
  zip's central directory and only the entries it needs (via `Blob.slice`), decodes plists /
  Mach-O / AXML / protobuf manifests, evaluates the rules, and posts the resulting JSON report back
  to the main thread, which only renders it.
- **CLI**: `storeready` runs locally in your terminal or CI runner; it never calls a network API.

## What never happens

No accounts, no server, no uploads, no analytics, no telemetry, no cookies. The only network
requests the web page ever makes are same-origin `GET`s for its own static assets (HTML, JS, CSS,
the worker script, icons) — nothing else, not even while analysing a file.

## How this is enforced

1. **Content-Security-Policy** `<meta>` tag with `connect-src 'none'`, `script-src 'self'`,
   `worker-src 'self' blob:'`, `object-src 'none'`, `form-action 'none'` — see `apps/web/index.html`
   once it exists (Milestone 3).
2. **ESLint rules** (`eslint.config.js`) ban `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
   `navigator.sendBeacon`, and `importScripts` in `apps/web/src/**` and `packages/core/src/**`.
3. **An automated Playwright test** (Milestone 3) records every network request for a whole
   analysis session and fails if anything but a same-origin static-asset `GET` is observed, and a
   separate test loads the app offline (`context.setOffline(true)`) and analyses a sample
   successfully.

## Verifying it yourself

Open your browser's DevTools → Network tab, drop a build into the page, and watch: you'll see the
page's own JS/CSS/worker load once, and nothing else — no requests fire while the file is analysed.
