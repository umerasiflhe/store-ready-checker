# 1. Analyze builds entirely on-device, never upload them

## Status

Accepted

## Context

Store Ready reads `.ipa`/`.aab`/`.apk` files that can contain proprietary app code, signing
details, and sometimes customer-identifying strings. A tool that asks developers to upload their
build to a server to get a rejection report would itself become a trust liability — exactly the
kind of risk-surface the tool's own lead-magnet pitch ("fix my store rejection" work) depends on
not having.

## Decision

All analysis happens on the user's device: in a Web Worker in the browser for the web app, and
locally in the `storeready` CLI. No server component exists. This is hard constraint #1 in
`CLAUDE.md` and is enforced by a CSP (`connect-src 'none'`) and an automated Playwright test that
records every network request during an analysis session.

## Consequences

- No accounts, telemetry, or usage analytics are possible without contradicting this decision.
- Hosting is free (GitHub Pages) since there's no backend to run or scale.
- Large files (1–2 GB) must be handled with streaming/partial reads rather than a server with more
  memory and compute headroom — this shapes the zip-reading strategy (ADR 2).
