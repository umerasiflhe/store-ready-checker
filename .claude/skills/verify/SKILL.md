---
name: verify
description: Run everything CI checks (repo check, every linter, typecheck, unit tests, Swift tests, conformance, rules freshness) before a commit or at the end of a task. Fast by default; pass --full for end-to-end tests and the git-hooks self-test.
allowed-tools: Bash
---

Run `./scripts/verify.sh` from the repo root. It runs, in order:

1. `npm run check:repo` — the §9.1 repo-hygiene checks (README/LICENSE present and correct, no
   stray binaries, no oversized tracked files, README links resolve, rules block is fresh).
2. `npm run lint` — every linter from the brief's §7.7 table, zero warnings allowed.
3. `npm run typecheck`
4. `npm run test:unit`
5. `npm run test:swift` — only when on macOS and `cli/Package.swift` exists.
6. `npx tsx scripts/conformance.ts` — builds `storeready` and diffs its JSON against the TS core
   on every fixture.
7. `npx tsx scripts/sync-rules.ts --check` and `npx tsx scripts/gen-rules-doc.ts --check` — fail if
   `cli/Sources/StoreReadyCore/Resources`, `docs/RULES.md`, or the README rules table are stale.

This takes under a few minutes and is what the `pre-push` git hook runs automatically. Run it
yourself before telling the user a change is done.

Pass `--full` (`./scripts/verify.sh --full`) to additionally run:

- `./scripts/test-git-hooks.sh` — proves the git hooks actually reject bad commits, in a temporary
  clone. Slower (clones the repo, makes several throwaway commits).
- `npm run test:e2e` — the Playwright suite on every browser project.

If any step fails, fix the underlying issue — never weaken a test, lint rule, or coverage gate to
make `verify` pass, and never bypass the git hooks to get a commit through.
