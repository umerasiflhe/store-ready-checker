---
name: release
description: Cut a Store Ready release — version bump, tag, push, and confirm the release/deploy workflows and live smoke test succeeded. Only run when the user explicitly asks to release/ship a version.
disable-model-invocation: true
---

This is a deliberate, user-initiated action — never run it just because tests are green.

1. **Pre-flight**: `./scripts/verify.sh --full` passes. `CHANGELOG.md` has a dated entry for the
   version being released (move `[Unreleased]` items under the new version heading).
2. **Version bump**: the new SemVer version in `apps/web/package.json`,
   `packages/core/package.json`, `cli/Sources/StoreReadyCore/ToolInfo.swift` and
   `cli/Tests/StoreReadyCoreTests/ToolInfoTests.swift` (`scripts/check-repo.ts` fails if they
   disagree). Regenerate the goldens (`npx tsx fixtures/generators/updateGoldens.ts`; only
   `tool.version` changes) and update the README's CLI install snippet (`v=<version>`).
3. **Commit** the version bump (Conventional Commits, e.g. `chore(release): v1.0.0`). `main` is
   protected and squash-only, so land it through a PR and merge once the required checks pass.
4. **Tag** the merged commit on `main`: `git tag v<version>` matching the `release.yml` trigger pattern `v*.*.*`.
5. **Push** the commit and the tag — ask the user to confirm before pushing a tag; this is
   publishing, not a local checkpoint.
6. **Watch `release.yml`**: checks the tag matches both versions, builds the macOS universal and
   Linux x86_64 CLI tarballs plus `SHA256SUMS`, and creates the GitHub Release with notes from
   `CHANGELOG.md`.
7. **Watch `deploy.yml`** (runs after `ci.yml` is green on `main`): builds and deploys the site,
   then runs a post-deploy Playwright smoke test against the live URL.
8. **Confirm**: the Release page has the macOS universal and Linux x86_64 tarballs and
   `SHA256SUMS`; the live URL
   loads and shows the new version in its footer.
