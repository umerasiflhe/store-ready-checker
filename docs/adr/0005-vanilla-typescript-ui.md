# 5. Build the web UI in vanilla TypeScript, not a framework

## Status

Accepted

## Context

The web app's UI surface is small and well-defined: a drop zone, a progress view, a result view
with filterable findings, and a handful of trust-signal panels. The performance budget is tight
(initial JS ≤ 120 KB gzipped) and the privacy model (hard constraint 1) means every dependency is
extra surface area to audit for accidental network calls.

## Decision

Build `apps/web` with Vite + vanilla TypeScript and CSS custom properties — no React/Vue/Svelte.
Preact is allowed only if a later milestone finds a concrete need and records the tradeoff in a new
ADR.

## Consequences

- No framework runtime to fit inside the JS budget, and no framework-specific escape hatches
  (portals, effects) that could accidentally introduce a network call outside the
  `privacy-guardian` agent's usual search patterns.
- More hand-written DOM update code than a framework would provide, which is an acceptable
  tradeoff given the UI's small, stable surface.
- Revisit if a later milestone's UI complexity (e.g. a much richer results view) makes
  hand-written DOM updates genuinely costly to maintain.
