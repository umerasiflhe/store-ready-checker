# 3. Host the web app on GitHub Pages

## Status

Accepted

## Context

The web app has no server component (ADR 1), so it only needs static hosting. The project must be
free to run indefinitely (hard constraint 8): public repo, standard GitHub Actions runners, no
paid services, no secrets required in CI.

## Decision

Deploy to GitHub Pages via `actions/upload-pages-artifact` + `actions/deploy-pages` in
`deploy.yml` (Milestone 5), triggered after `ci.yml` is green on `main`. Vite's `base` is set to
`/<repo>/` to match the Pages URL shape (`https://<owner>.github.io/<repo>/`).

## Consequences

- Zero hosting cost, but also no control over HTTP response headers (Pages doesn't let you set
  custom headers), no server-side redirects, and no PR preview deployments.
- The CSP that enforces hard constraint 1 must be delivered as an HTML `<meta>` tag rather than a
  response header, since Pages can't add custom headers.
- Cloudflare Pages is documented as a possible later upgrade (real headers, PR previews) but isn't
  implemented — switching hosts isn't free of its own setup cost, and GitHub Pages meets every
  current requirement.
