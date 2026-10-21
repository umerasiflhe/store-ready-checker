# 4. Maintain a separate Swift implementation, verified by conformance tests

## Status

Accepted

## Context

Store Ready ships two surfaces: a browser UI and a CLI for terminals/CI. The CLI could either wrap
the TypeScript core (via a bundled Node runtime, or a WASM build) or be a genuinely independent
Swift implementation of the same parsers and rule checks.

## Decision

Write `cli/` as an independent Swift package (`StoreReadyCore` + `storeready`), not a wrapper
around the TypeScript core. A `scripts/conformance.ts` job runs both implementations against every
fixture and diffs their normalized JSON output (dropping `tool.version`) — any difference fails
CI. Both implementations read the exact same `rules/rules.json` data (synced into the Swift
package's resources by `scripts/sync-rules.ts`), so only the parsing/evaluation logic itself can
diverge, not the rule data.

## Consequences

- Real double implementation cost: every parser and rule check is written and tested twice.
- In exchange: a native macOS binary with no bundled runtime, Swift's strict concurrency as a
  genuine correctness check on the design (not just a reimplementation of whatever the TS side
  does), and conformance tests that catch spec ambiguity early — a divergence between the two
  implementations usually means the rule or parser spec itself was underspecified.
- `fixtures/expected/*.json` becomes the real contract between the two codebases; changing
  behavior means updating fixtures deliberately (see the `make-fixture` skill), not quietly.
