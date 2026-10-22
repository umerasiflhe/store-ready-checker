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
- Milestone 1 (iOS core, TypeScript): `packages/core` now reads an `.ipa` end to end and reports
  every `IOS-*` rule from the brief — zip central-directory reader (`@zip.js/zip.js`), a
  dependency-free binary (`bplist00`) plist decoder and an XML plist reader (`fast-xml-parser`),
  a Mach-O parser (fat/thin headers, symbol table, bind opcodes, chained fixups,
  `__objc_methname` selectors, FairPlay-encryption detection), bundle discovery (app, app
  extensions, App Clips, Watch apps, frameworks, resource bundles), required-reason API
  detection, privacy-manifest validation, listed-third-party-SDK matching, a data-driven rules
  engine with timeline evaluation at boundary dates, and a deterministic report builder.
- 15 synthetic iOS fixtures with golden reports covering the full brief §7.1 matrix (passing app,
  old Xcode/SDK, low `MinimumOSVersion`, each `IOS-PRIV-*` case, an app extension built with an
  old SDK, a fat binary, an encrypted binary, binary vs. XML plists, not-a-zip, and
  zip-without-`Payload/`), plus property-based fuzz tests (`fast-check`) proving every parser
  returns a typed error instead of throwing on random or truncated input.
- Coverage gate enforced: `packages/core` requires ≥90% line / ≥85% branch coverage
  (`npm run test:coverage`), wired into `scripts/verify.sh` and the new `web` CI job.
- CI (`ci.yml`): added the `web` job (repo check, unit tests + coverage gate, conformance,
  rules sync/doc freshness).
