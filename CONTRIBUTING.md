# Contributing

Store Ready is a free, open-source tool; contributions are welcome.

## Prerequisites

- Node, version pinned in [`.nvmrc`](.nvmrc) (`nvm use`).
- Xcode 26 (macOS) for the Swift CLI, or the matching Swift 6 toolchain on Linux.
- `brew install actionlint shellcheck` (or your platform's equivalents).

## Setup

```bash
npm ci   # installs dependencies and installs the git hooks (lefthook) via the "prepare" script
```

## What runs on every commit

Git hooks are managed by [lefthook](lefthook.yml) and installed automatically by `npm ci` /
`npm install`. They are **mandatory** — never bypass them (`--no-verify`, `git commit -n`,
`LEFTHOOK=0`, or changing `core.hooksPath`). If a hook is wrong or too slow, fix the hook itself in
its own commit.

| Hook         | Runs                                                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | Auto-fixes staged files (ESLint `--fix`, Prettier, `swift format`) and re-stages them, then checks: linters, `typecheck`, `check:repo`, unit tests, and Swift tests when Swift-relevant files are staged. |
| `commit-msg` | `commitlint` against [Conventional Commits](https://www.conventionalcommits.org/).                                                                                                                        |
| `pre-push`   | `scripts/verify.sh` — everything CI runs, except the end-to-end suite.                                                                                                                                    |

CI (`.github/workflows/ci.yml`) runs the full suite, including end-to-end tests, on every push and
pull request.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`, …), enforced by
`commit-msg`. One logical change per commit.

## Pull requests

`main` is protected: changes land through a pull request with the `lint`, `web`, `e2e`, `swift` and
`conformance` checks green, squash-merged so history stays linear. The PR template's checklist
mirrors the definition of done in `CLAUDE.md`.

## Before you open a pull request

Run `./scripts/verify.sh` (or `./scripts/verify.sh --full` to include end-to-end tests) and make
sure it passes. Never weaken a test, a lint rule, or a coverage gate to get a change through — an
`eslint-disable` needs a one-line reason explaining why.

## Adding or changing a rule

See the `add-store-rule` skill (`.claude/skills/add-store-rule/SKILL.md`) for the full checklist:
confirm against the official source, update `rules/rules.json`, add fixtures and golden files,
regenerate `docs/RULES.md`, bump `rulesVersion`.
