# 7. Use lefthook for git hooks

## Status

Accepted

## Context

Hard constraint 10 requires every commit to be linted and tested locally, not just in CI, and the
hooks need to: auto-fix staged files (ESLint, Prettier, `swift-format`) and re-stage them, then run
a mix of glob-scoped and unconditional checks, fast enough to not get bypassed out of frustration
(target: under 60 seconds for `pre-commit`).

## Decision

Use [lefthook](https://github.com/evilmartians/lefthook) (an npm `devDependency`, installed into
`.git/hooks/` by the `prepare` script on `npm ci`/`npm install`). `lefthook.yml` defines
`pre-commit` (piped fix steps, then parallel checks), `commit-msg` (commitlint), and `pre-push`
(`scripts/verify.sh`). `scripts/test-git-hooks.sh` proves the hooks actually reject bad commits
and auto-fix formatting, by installing them in a throwaway clone — this runs in `verify --full` and
in CI, so hook regressions are themselves caught by CI.

## Consequences

- One YAML file, rather than hand-written shell scripts in `.git/hooks/` (which git doesn't
  version-control by default — lefthook's install step is what makes the hooks themselves
  reproducible from a committed file).
- `lefthook install` must run before the hooks exist, which is a real bootstrapping
  chicken-and-egg: the repo's very first commits had to be made before any tooling existed to
  check them (see `CHANGELOG.md`'s Milestone 0 entry).
- If `pre-commit` ever creeps past the 60-second budget as the unit suite grows, switch the
  `unit-tests` job to `vitest related --run {staged_files}` plus a full run when
  `rules/`/`schema/`/`fixtures/`/config files change — record that switch in a new ADR, and never
  drop tests from the hook to make it faster.
