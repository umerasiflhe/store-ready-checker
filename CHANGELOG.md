# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-23

First stable release. Every rule was re-audited against its official source, and the fixes are
below: per-form-factor Play deadlines for target SDK, 16 KB page sizes and 64-bit code, and
required-reason APIs that Apple lists under two categories. The web app gains PNG icons and an
Open Graph image, the README gains demo GIFs and its final layout, and the end-to-end suite now
also runs on an iPhone profile.

### Added

- The end-to-end suite also runs on an iPhone 15 (mobile WebKit) profile, offline test included.
- Demo GIFs in the README (web app and CLI), recorded by `scripts/record-demo/` (Playwright video
  plus ffmpeg, and a VHS tape). The repo check fails if a demo GIF is over 4 MB.
- PNG app icons (192, 512, a maskable 512, and a 180 px `apple-touch-icon` for iOS home screens)
  and an Open Graph image for link previews, rendered by `npm run gen:images`. The icons are
  precached for offline use.
- The 16 KB page-size rules (`AND-16K-001` to `003`) become errors earlier for TV apps (from
  2026-08-01) and Wear OS apps (from 2026-09-15), per Google Play Console's technical quality
  requirements. Timeline entries can now be limited to form factors, and 16 KB findings show the
  form factor in their evidence.
- `rules-watch` also watches the Play Console technical quality requirements page.
- Required-reason detection covers `UIDocument.fileModificationDate` (FileTimestamp) and treats
  `getattrlist`, `fgetattrlist` and `getattrlistat` as DiskSpace too, as Apple lists them under
  both categories.
- `rules-watch` also watches Apple's `NSPrivacyAccessedAPIType` reference, which now holds the
  category and API tables, and its DocC extraction keeps inline API links.

### Changed

- The README follows its final v1 order, adding "Use in CI" (a tested GitHub Actions step),
  "What it doesn't check", "How it works" and "Contributing". SPEC, ARCHITECTURE (now with a
  delivery section) and TESTING describe what shipped.
- `IOS-PRIV-004` cites Apple's April 2024 announcement for its 2024-05-01 start, and its fix
  steps mention the SDK signature Apple also requires (which this tool doesn't check). Every rule
  source is re-read as of 2026-10-23.
- The 16 KB rules' 2025-11-01 warning start now cites Google's May 2025 announcement, since the
  page-sizes guide no longer mentions it.
- The required-reason API and listed-SDK seed data are verified against Apple's current pages
  (2026-10-23), and `IOS-PRIV-001` to `003` also cite the `NSPrivacyAccessedAPIType` reference.

### Fixed

- CI: the post-deploy smoke test shares the e2e job's cached Playwright setup (now the
  `setup-playwright` composite action), so a slow apt mirror no longer fails a deploy.
- `AND-64BIT-001` uses Google Play's dates per form factor: required since 2019-08-01 for phone,
  tablet, Automotive and XR apps (not 2021-08-01, when Play stopped serving 32-bit-only apps on
  64-bit devices), from 2026-08-01 for TV and from 2026-09-15 for Wear OS. Earlier "as of" dates
  for TV and Wear apps now give an info finding instead of an error.
- `IOS-PRIV-002` no longer reports an API that Apple lists under two categories when the privacy
  manifest declares either one (e.g. `getattrlist` with only DiskSpace declared).
- `AND-TSDK-002` uses Google Play's per-form-factor minimum for staying available to new users
  (35 for phones and tablets, 34 for Wear OS, Android TV and Android XR, 32 for Android Automotive
  OS) instead of 35 for every app, so Wear, TV, XR and Automotive apps no longer get a false
  warning. Rules version `2026.10.23`.
- CI: the `e2e` job caches Playwright's ~120 MB of apt packages, so a slow Ubuntu mirror no longer
  times it out.
- CI: commitlint exempts Dependabot's commits by their sign-off trailer, so a squash-merged
  Dependabot PR no longer fails `lint` on `main`.

## [0.9.0] - 2026-10-23

First public pre-release: the web checker is live on GitHub Pages and the `storeready` CLI ships
as prebuilt macOS (universal) and Linux binaries. Everything from Milestones 0–5 is below.

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
- Milestone 3 (web app): `apps/web` is a real Vite + vanilla-TypeScript PWA at
  `/store-ready-checker/`. A Web Worker (`apps/web/src/worker.ts`) parses a dropped/picked
  `.ipa`/`.aab`/`.apk` once, caches the extracted facts, and evaluates rules against them;
  changing the "Check as of" date or an Android form-factor override sends a cheap `reevaluate`
  message that re-runs only the rules engine — never re-reading the archive. `packages/core`'s
  public API grew the split this needs (`analyzeIosBundles`/`analyzeAndroidBundle`,
  `evaluateIosRules`/`evaluateAndroidRules`, `buildReport`, `ZipArchive`) alongside the existing
  one-shot `analyzeIpa`/`analyzeAab`/`analyzeApk`, plus an optional `formFactorOverride` on
  `evaluateAndroidRules` and a new `reportToMarkdown` serializer.
- UI states: idle (drop zone, file picker, three bundled sample builds — never fetched, inlined
  as base64 by `scripts/gen-web-samples.ts`), analysing (stage progress, cancel), result (verdict
  banner, severity filter, expandable findings with evidence/fix/sources/heuristic badges,
  copy-as-Markdown, download-JSON), and four error states. A persistent trust panel and footer
  (version, rules version, GitHub link, `VITE_CONTACT_URL` CTA) render throughout.
- CSP exactly per brief §6.5; PWA via `vite-plugin-pwa` (same-origin precache only); `size-limit`
  keeps the initial JS under 120 KB gzip (currently ~45 KB — the worker and `packages/core` are
  lazily loaded as a separate chunk only once a file is analysed).
- 80 Playwright tests (`e2e/*.spec.ts`) across Chromium, Firefox, WebKit, and a Pixel 7 mobile
  viewport: sample/drop/file-input flows against the golden fixtures, keyboard-only operation,
  zero `@axe-core/playwright` violations on idle/result/error, a privacy test recording every
  network request for a full session (same-origin static `GET`s only, zero while analysing),
  offline-after-first-load, console/CSP-violation failures, the 16K finding's severity flip
  across `2027-02-01`, schema-validated JSON/Markdown exports, and a ~500 MB synthetic-IPA
  (`fixtures/generators/large-ipa.ts`, generated on demand, never committed) analysed in under
  10 s on desktop Chromium. Found and fixed two real bugs along the way: inline `style.x =`
  assignments were silently violating our own CSP under WebKit, and the drop zone was a
  `div[role=button][tabindex=0]`, which Safari's default Tab order skips — it's a real `<button>`
  now.
- CI (`ci.yml`): `web` job gained a build step, `size-limit`, and web-samples freshness; new
  `e2e` job runs the full Playwright suite and uploads the report on failure.
- Milestone 4 (Swift CLI): per ADR 0004, `cli/` is an independent reimplementation of
  `packages/core`'s parsers and rule checks — not a wrapper — in `StoreReadyCore`
  (library) and `storeready` (executable), both under Swift 6 strict concurrency.
  Mirrors the TS module layout 1:1 (`Util`, `Zip`, `Plist`, `iOS`, `Android`, `Rules`,
  `Report`), with two deliberate, brief-sanctioned deviations: `Foundation.PropertyListSerialization`
  instead of a hand-rolled plist decoder, and plain `Codable` instead of a port of the
  hand-rolled `rules.json` validator (both only process trusted, schema-validated repo
  data, unlike the zip/plist/Mach-O/ELF/AXML/AAB-manifest parsers, which still follow the
  strict never-throw `Result` pattern for arbitrary uploaded files).
- `swift-protobuf`-generated Swift for the same vendored `.proto` files TypeScript already
  generates from (ADR 0006), wired into `scripts/gen-proto.ts` and drift-checked by
  `scripts/check-repo.ts`; `ZIPFoundation` for zip listing/extraction, with a hand-read raw
  local file header for the `AND-16K-003` zip-alignment check (the TS implementation
  deliberately doesn't trust a library's central-directory copy of that field, and neither
  does this one).
- `storeready check <file> [--format text|json|markdown] [--as-of] [--form-factor]
[--fail-on] [--no-color]` and `storeready rules [--format text|json]`, per brief §6.6's
  interface. Exit codes `0`/`1`/`2` per the brief's table, with one documented, scoped
  deviation: swift-argument-parser's own flag-syntax validation errors (not this tool's own
  logic) exit `64` (`EX_USAGE`) rather than `2`, since that mapping isn't public API.
- 82 Swift tests (Swift Testing): parser/rule-check unit tests against the same real
  fixtures the TS side uses, full golden-JSON structural comparisons for every iOS/Android
  fixture, and black-box CLI integration tests that spawn the built `storeready` binary
  against all 32 fixtures and assert exit codes and JSON output.
- `scripts/conformance.ts` is now a real parity gate: builds `storeready` in release mode,
  runs both it and the TS core on every fixture, and diffs their JSON output (`tool.version`
  normalized out). New CI jobs `swift` and `conformance` (both `macos-26`) run this on every
  push and pull request.
- Milestone 5 (CI/CD + hosting): the web app deploys to
  <https://umerasiflhe.github.io/store-ready-checker/> from `deploy.yml` after CI is green on
  `main`, then a smoke job checks the CSP `<meta>` in the served HTML and runs the analyze and
  privacy Playwright specs against the live URL.
- `release.yml`: on a `v*.*.*` tag, checks the tag against every version source, builds a macOS
  universal (arm64 + x86_64) and a Linux x86_64 (static Swift stdlib) `storeready`, packages each
  with its resource bundle, smoke-tests the extracted tarball with the build tree deleted, and
  publishes a GitHub Release with `SHA256SUMS` and notes from this file
  (`scripts/changelog-section.ts`).
- `real-builds.yml` (brief §7.6): builds a real unsigned `.ipa` with Xcode 26 (XcodeGen + `xcodebuild
archive`) and real `.aab`s with AGP 9.4 + NDK r28 from `fixtures/real-builds/`, then
  `scripts/check-real-build.ts` checks every variant with both the TS core and the Swift CLI: ready
  builds report `ready`, deployment target 12.0 reports `IOS-MINOS-001`, a 4 KB `max-page-size`
  library reports `AND-16K-001`, `targetSdk 34` reports `AND-TSDK-001`, and both implementations
  agree on every one. The real build's `DTXcode` (`2660`) is recorded in the job summary.
- `rules-watch.yml` + `scripts/rules-watch.ts`: weekly, hashes the article text of every official
  page in `rules/sources.lock.json` (Apple's DocC JSON for the JS-rendered required-reason page;
  devsite pages pinned to English, since they localise per request) and opens or comments on a
  `rules-change` issue per changed page. Hashes are now recorded for all six sources.
- `codeql.yml` (JavaScript/TypeScript), `.github/dependabot.yml` (npm, Swift, Actions),
  `CODEOWNERS`, a PR template with the definition-of-done checklist, and bug-report (JSON report,
  never the binary) and rule-change issue templates.
- `swift-linux` CI job (official `swift:6.3.2-noble` image, best effort).
- The tool version has one source per language (`apps/web/package.json`, `ToolInfo.swift`), and the
  repo check fails if they disagree.

### Fixed

- CI could hang for hours: no job had a timeout, and `playwright install-deps` stalled forever on
  an unresponsive apt mirror. Every job now has a timeout, apt connections time out and retry, and
  Playwright browsers are cached.
- The Swift CLI didn't compile on Linux (CoreFoundation's `CFGetTypeID` for plist booleans, and the
  non-`Sendable` Glibc `stdout` global).
- The Playwright specs navigated to `/`, which resolves to the origin root, so they couldn't run
  against GitHub Pages' `/store-ready-checker/` path.

[Unreleased]: https://github.com/umerasiflhe/store-ready-checker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/umerasiflhe/store-ready-checker/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/umerasiflhe/store-ready-checker/releases/tag/v0.9.0
