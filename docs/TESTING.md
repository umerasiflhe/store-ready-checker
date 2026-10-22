# Testing

## Layers

| Layer             | Tool                                                              | Command              | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (TypeScript) | Vitest                                                            | `npm run test:unit`  | Parsers, rule checks, property-based tests (`fast-check`), rules-engine timeline evaluation, golden fixture comparisons.                                                                                                                                                                                                                                                                                                                                                                                        |
| Unit (Swift)      | Swift Testing                                                     | `npm run test:swift` | Same parser/rule cases as TypeScript, plus CLI integration tests.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Conformance       | `scripts/conformance.ts`                                          | part of `verify`     | Diffs TS core vs Swift CLI JSON output per fixture; any difference fails.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| End-to-end        | Playwright (Chromium, Firefox, WebKit, a Pixel 7 mobile viewport) | `npm run test:e2e`   | Drop/pick/sample flows against the golden fixtures, keyboard-only operation, privacy (no network requests beyond same-origin static GETs), offline/PWA, console/CSP-violation errors, the 16K finding's severity flipping across its 2027-02-01 boundary, copy-as-Markdown/download-JSON, accessibility (`@axe-core/playwright`), error states, and a 500 MB performance budget (desktop Chromium only). Builds and serves a production build itself. Only run with `verify --full` locally; always runs in CI. |
| Real-toolchain    | `real-builds.yml` (CI, scheduled)                                 | —                    | Builds real Xcode/Gradle artifacts and checks the tool against them.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Fixture matrix

Synthetic fixtures live in `fixtures/files/`, generated deterministically by scripts in
`fixtures/generators/`, with golden expected reports in `fixtures/expected/`. The matrix (passing
and failing variants for every rule, boundary-date cases, malformed input) is specified in
`docs/BUILD_BRIEF.md` §7.1 and grows alongside the rule checks in Milestones 1–2. Never commit a
real third-party app binary — only synthetic fixtures built by committed generator scripts.

Three of these fixtures are also re-exported as the web app's "Try a sample" buttons: run
`npm run gen:web-samples` (checked by `--check` in CI) after changing which fixtures back them.
The e2e performance test's ~500 MB IPA (`fixtures/generators/large-ipa.ts`) is generated on demand
into the gitignored `fixtures/generated/`, never committed.

## Coverage gate

`packages/core` requires ≥ 90% line coverage and ≥ 85% branch coverage once its parsers and rule
checks land (Milestone 1 onward). Never weaken this gate to make a build pass.

## Running everything locally

```bash
npm run lint          # every linter, zero warnings allowed
npm run typecheck
npm test              # same as npm run test:unit
npm run test:swift
./scripts/verify.sh          # what CI checks, fast (no e2e)
./scripts/verify.sh --full   # adds the Playwright suite
```
