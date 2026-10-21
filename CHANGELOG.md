# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Milestone 0 (bootstrap): repo scaffolding (npm workspaces, strict TypeScript, ESLint, Prettier, markdownlint, commitlint, lefthook git hooks with a self-test).
- Swift CLI package skeleton (`storeready --version`).
- `schema/report.schema.json` and `schema/rules.schema.json`.
- Every v1 rule from the brief recorded as data in `rules/rules.json`, with `docs/RULES.md` and the README table generated from it.
- `scripts/check-repo.ts`, `scripts/verify.sh`, `scripts/test-git-hooks.sh`, `scripts/conformance.ts`, `scripts/sync-rules.ts`, `scripts/gen-rules-doc.ts`.
- CI (`ci.yml`) with the `lint` job.
- `CLAUDE.md`, seven project skills, four subagents, and `.claude/settings.json` with its three hooks.
- Seven ADRs and the core documentation set (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `THIRD_PARTY_NOTICES.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/CI-CD.md`, `docs/PRIVACY.md`).
