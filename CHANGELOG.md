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
- Milestone 2 (Android core, TypeScript): `packages/core` now reads an `.aab`/`.apk` end to end
  and reports every `AND-*` rule from the brief. Vendors AOSP aapt2's `Resources.proto`/
  `Configuration.proto` and bundletool's `config.proto` (ADR 0006), generating TypeScript with
  `buf` + `@bufbuild/protoc-gen-es` into `packages/core/src/gen/` (drift-checked in
  `scripts/check-repo.ts`). Adds: an `aapt.pb.XmlNode` protobuf decoder for AAB module manifests
  and a hand-written AXML (binary XML) chunk parser for APK manifests, both reading
  `targetSdkVersion`/`minSdkVersion` by resource ID with a name fallback and treating a missing
  `<uses-sdk>` or a preview-codename target SDK as "assumed"/"≥ latest" rather than an error;
  form-factor inference from `<uses-feature>`; an ELF64 program-header reader and a native-library
  walker (every module's `lib/<abi>/*.so`, plus each APK entry's zip-alignment data offset read
  from its raw local file header); a `BundleConfig.pb` decoder; and the eight `AND-*` rule checks
  (target-SDK-by-form-factor, the three 16 KB page-size checks — `PT_LOAD` alignment, the
  `PT_GNU_RELRO` extent exception, zip alignment — plus their `BundleConfig` companion, the 64-bit
  ABI-pairing check, and the native-code-absent info rule).
- 17 synthetic Android fixtures with golden reports covering every `AND-*` rule's pass/fail
  branches, the `2027-02-01` 16 KB severity boundary (asserted both sides against the same
  fixture), the RELRO own-segment exemption, zip-alignment vs. compression gating, and
  malformed-manifest/not-a-zip/no-manifest edge cases.
