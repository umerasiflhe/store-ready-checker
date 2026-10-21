---
name: release
description: Cut a Store Ready release — version bump, tag, push, and confirm the release/deploy workflows and live smoke test succeeded. Only run when the user explicitly asks to release/ship a version.
disable-model-invocation: true
---

This is a deliberate, user-initiated action — never run it just because tests are green.

1. **Pre-flight**: `./scripts/verify.sh --full` passes. `CHANGELOG.md` has a dated entry for the
   version being released (move `[Unreleased]` items under the new version heading).
2. **Version bump**: the new SemVer version in every root/workspace `package.json` and in the
   Swift package's version string (`cli/Sources/StoreReadyCore/ToolInfo.swift` or equivalent).
   Keep the web app, CLI, and `CHANGELOG.md` in sync.
3. **Commit** the version bump (Conventional Commits, e.g. `chore(release): v1.0.0`).
4. **Tag**: `git tag v<version>` matching the `release.yml` trigger pattern `v*.*.*`.
5. **Push** the commit and the tag — ask the user to confirm before pushing a tag; this is
   publishing, not a local checkpoint.
6. **Watch `release.yml`**: builds the macOS universal CLI binary + checksums, creates the GitHub
   Release with notes from `CHANGELOG.md`.
7. **Watch `deploy.yml`** (runs after `ci.yml` is green on `main`): builds and deploys the site,
   then runs a post-deploy Playwright smoke test against the live URL.
8. **Confirm**: the Release page has the expected assets and `.sha256` checksums; the live URL
   loads and shows the new version in its footer.
