# Store Ready

Check an iOS or Android build against the current App Store Connect and Google Play upload rules before you upload it. It runs in your browser, and your file is never uploaded.

[![CI](https://github.com/umerasiflhe/store-ready-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/umerasiflhe/store-ready-checker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Status: in development.** The web checker will be live at <https://umerasiflhe.github.io/store-ready-checker/> after Milestone 5. Progress is in [CHANGELOG.md](CHANGELOG.md).
>
> **Works today (Milestone 3 — web app):** drop (or try a sample) `.ipa`, `.aab`, or `.apk` at
> `npm run dev`/`npm run build` + `npm run preview` and get a full report, entirely client-side —
> a Web Worker parses the zip's central directory once, evaluates every `IOS-*`/`AND-*` rule
> below, and lets you change the "Check as of" date or an Android form-factor override and
> re-evaluate instantly without re-reading the file. Results are filterable by severity, with
> evidence/fix-steps/sources per finding, copy-as-Markdown, and download-JSON. Installable
> offline PWA; CSP blocks any outgoing request. Verified by 80 Playwright tests across
> Chromium/Firefox/WebKit/a mobile viewport (drop/sample flows, keyboard-only use, zero
> accessibility violations, zero network requests beyond same-origin static assets, a 500 MB
> file analysed in under 10 s) plus the 32 synthetic-fixture/unit-test suite from Milestones 1–2.
> No Swift CLI parity yet (Milestone 4); not deployed to Pages yet (Milestone 5).

## What it checks

<!-- rules:start -->

| ID              | Platform | Check                                                                                       | In force from |
| --------------- | -------- | ------------------------------------------------------------------------------------------- | ------------- |
| `IOS-SDK-001`   | ios      | Built with Xcode 26+ using the iOS 26 SDK                                                   | 2026-04-28    |
| `IOS-MINOS-001` | ios      | MinimumOSVersion must be at least 13.0                                                      | 2026-09-09    |
| `IOS-PRIV-001`  | ios      | Required-reason API used without a privacy manifest                                         | 2024-05-01    |
| `IOS-PRIV-002`  | ios      | Required-reason API category not declared in privacy manifest                               | 2024-05-01    |
| `IOS-PRIV-003`  | ios      | Privacy manifest is malformed or declares an unknown category/reason code                   | 2024-05-01    |
| `IOS-PRIV-004`  | ios      | Listed third-party SDK bundled without its own privacy manifest                             | 2024-05-01    |
| `IOS-INFO-001`  | ios      | Executable is encrypted — API detection is limited                                          | 1970-01-01    |
| `AND-TSDK-001`  | android  | targetSdkVersion meets the Play requirement for new apps and updates                        | 2026-08-31    |
| `AND-TSDK-002`  | android  | targetSdkVersion should be at least 35 to stay visible to new users                         | 2026-08-31    |
| `AND-16K-001`   | android  | 64-bit native libraries must be 16 KB page aligned                                          | 2025-11-01    |
| `AND-16K-002`   | android  | GNU_RELRO segment must end 16 KB aligned (unless in its own LOAD segment)                   | 2025-11-01    |
| `AND-16K-003`   | android  | Stored (uncompressed) native libraries must be 16 KB zip-aligned (APK only)                 | 2025-11-01    |
| `AND-16K-004`   | android  | BundleConfig.pb should request 16 KB alignment when native libs are uncompressed (AAB only) | 2025-11-01    |
| `AND-64BIT-001` | android  | 32-bit native code must ship alongside a matching 64-bit ABI                                | 2021-08-01    |
| `AND-INFO-001`  | android  | No 64-bit-relevant native code detected                                                     | 1970-01-01    |

<!-- rules:end -->

Sources and dates for every rule: [docs/RULES.md](docs/RULES.md).

## Privacy

Your build is read by a Web Worker inside your browser and is never sent anywhere. A Content-Security-Policy blocks outgoing data, and an automated test proves it. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Develop

```bash
npm ci                # install dependencies and the git hooks
npm run dev           # web app at http://localhost:5173/store-ready-checker/
npm run build         # production build (apps/web/dist)
npm run preview       # serve that build at http://localhost:4173/store-ready-checker/
npm run lint          # every linter
npm test              # unit tests
./scripts/verify.sh   # what CI checks, quickly
./scripts/verify.sh --full   # adds the Playwright e2e suite
```

Needs Node (version in `.nvmrc`), Xcode 26 for the Swift CLI, and `brew install actionlint shellcheck`. Every commit runs the linters and unit tests through git hooks; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

[Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [CI/CD](docs/CI-CD.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE). Not affiliated with Apple or Google.
