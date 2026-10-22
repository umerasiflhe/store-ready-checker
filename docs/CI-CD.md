# CI/CD

## Hosting

GitHub Pages (free for public repos), deployed by GitHub Actions. Live URL:
`https://umerasiflhe.github.io/store-ready-checker/`.

## Workflows

| File              | Trigger                                                     | Status                        | Jobs                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`          | push to any branch, pull_request, `workflow_dispatch`       | **Live** (`lint`, `web` jobs) | `lint`, `web` (repo check, coverage gate, conformance, rules freshness) today; `web` build/size-limit, `e2e`, `swift`, `swift-linux` arrive with M2–M4. |
| `deploy.yml`      | push to `main` after `ci.yml` succeeds, `workflow_dispatch` | Planned for Milestone 5       | Build site, `actions/upload-pages-artifact`, `actions/deploy-pages`, post-deploy Playwright smoke test.                                                 |
| `release.yml`     | tag `v*.*.*`                                                | Planned for Milestone 5       | Build the macOS universal CLI binary + checksums, GitHub Release from `CHANGELOG.md`.                                                                   |
| `real-builds.yml` | weekly schedule, `workflow_dispatch`                        | Planned for Milestone 5       | Build real Xcode/Gradle artifacts in CI and check the tool against them.                                                                                |
| `rules-watch.yml` | weekly schedule, `workflow_dispatch`                        | Planned for Milestone 5       | Hash the official pages in `rules/sources.lock.json`; open/update a `rules-change` issue on drift.                                                      |
| `codeql.yml`      | pull_request, push, weekly                                  | Planned for Milestone 5       | CodeQL for JavaScript/TypeScript.                                                                                                                       |

Every third-party action is pinned to a full commit SHA; every workflow sets least-privilege
`permissions` and a `concurrency` group.

## Required checks

Branch protection on `main` (configured in Milestone 5) requires `lint`, `web`, `e2e`, `swift`, and
`conformance` to pass, with linear history and squash merges only.

## Versioning

SemVer for the tool, date-based `rulesVersion` (`YYYY.MM.DD`) for rule data bumped whenever
`rules/rules.json` changes, Conventional Commits, `CHANGELOG.md` in Keep a Changelog format.
