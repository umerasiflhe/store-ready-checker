# Store Ready — Build Brief for Claude Code

> **How to use this file (for the human).** Create an empty public GitHub repo (suggested name `store-ready`) and leave GitHub's "Add a README", ".gitignore" and "license" options unticked, because Claude Code creates those files in Milestone 0. Clone the repo, save this file as `docs/BUILD_BRIEF.md`, open the folder in Claude Code and send:
> `Read docs/BUILD_BRIEF.md completely. Ask me the questions in section 2, then execute Milestone 0. Use plan mode for each milestone and stop for my approval at the end of each one.`
> Brief written on 2026-10-20. Store rules change; the rules-watch workflow in this brief exists to catch that.

---

## 1. Your role and the mission

You are the sole engineer on **Store Ready**: a free, open-source tool that tells a mobile developer, in seconds, whether an app build will be rejected by App Store Connect or Google Play because of current platform rules — **before** they upload it.

Two deliverables share one rule set:

1. **Web app** (TypeScript, static site): the user drops an `.ipa`, `.aab` or `.apk`; analysis runs **entirely in the browser**; nothing is uploaded, ever.
2. **Swift CLI** (`storeready`): the same checks for terminals and CI pipelines, with identical JSON output.

Shipping criteria: a **live URL** on free hosting, a **README with a demo GIF**, full **unit + UI test** coverage, and a **complete GitHub CI/CD pipeline**.

This project is also the owner's portfolio piece and lead magnet for paid "fix my store rejection" work, so code quality, docs and the demo matter as much as features.

---

## 2. Ask me these first (one message, then proceed)

1. GitHub owner and repo name (default `store-ready`) → determines the live URL `https://<owner>.github.io/<repo>/`.
2. Display name and copyright holder for LICENSE (MIT).
3. Contact URL for the footer call-to-action "Need help fixing this?" (or none).
4. Is `gh` CLI installed and authenticated? (If yes, you configure repo settings yourself; if no, give me exact click-paths.)
5. Do you want a Linux build of the CLI in addition to macOS universal? (Default: yes, best-effort.)

Use sensible defaults for anything else and record each default in `docs/adr/`.

---

## 3. Product specification

### 3.1 Users and the job to be done

- **Mobile developer / agency** about to upload a build: "Will this upload be rejected, and exactly what do I fix?"
- **CI pipeline**: "Fail the build before upload if a store rule is violated."
- **Client without a developer** (lead-magnet path): "Is my app's update going to be blocked?" → readable report + contact link.

### 3.2 Inputs

| Input | Platform | Notes |
| --- | --- | --- |
| `.ipa` | iOS / iPadOS | Zip with `Payload/<Name>.app/`. Xcode-exported or CI-built. App Store-downloaded IPAs are FairPlay-encrypted: detect and degrade gracefully. |
| `.aab` | Android | Zip; protobuf manifests per module (`base/manifest/AndroidManifest.xml`), native libs at `<module>/lib/<abi>/*.so`, `BundleConfig.pb` at root. |
| `.apk` | Android | Bonus input. Binary XML (AXML) manifest; `lib/<abi>/*.so`; zip alignment matters. |

Files can be **1–2 GB**. Never read a whole archive into memory; read the central directory and only the entries you need.

### 3.3 The rules (v1)

All rules live in data (`rules/rules.json`), each with an ID, official source URL(s), the date the source was retrieved, and a **timeline** of severities by date. The engine evaluates every rule "as of" a date (default: today in the user's local time zone; user-selectable) so users can see what breaks on a future date.

| ID | Check | Severity timeline | Official source |
| --- | --- | --- | --- |
| `IOS-SDK-001` | App (and every embedded app extension) built with **Xcode 26+** using the **iOS 26 SDK+** (`DTXcode` ≥ 2600 and `DTSDKName`/`DTPlatformVersion` ≥ 26) | error from 2026-04-28 | https://developer.apple.com/news/upcoming-requirements/ |
| `IOS-MINOS-001` | `MinimumOSVersion` ≥ **13.0** | error from 2026-09-09 | same |
| `IOS-PRIV-001` | A bundle whose executable uses a **required-reason API** (detected) has **no** `PrivacyInfo.xcprivacy` | error from 2024-05-01, marked *heuristic* | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api |
| `IOS-PRIV-002` | Bundle has a privacy manifest, but a detected required-reason API **category is not declared** in `NSPrivacyAccessedAPITypes` | error from 2024-05-01, *heuristic* | same |
| `IOS-PRIV-003` | Privacy manifest is malformed, or declares an unknown category / reason code | error, *certain* | same |
| `IOS-PRIV-004` | A framework on Apple's **listed third-party SDKs** is bundled **without its own privacy manifest** | warning (Apple requires it for new apps and for updates that add the SDK; the tool cannot know which) | https://developer.apple.com/support/third-party-SDK-requirements/ |
| `IOS-INFO-001` | Executable is encrypted (`LC_ENCRYPTION_INFO(_64)` with `cryptid ≠ 0`): API detection is limited | info | — |
| `AND-TSDK-001` | `targetSdkVersion` meets the Play requirement for **new apps and updates**: **36** for phone/tablet; **35** for Wear OS and Android Automotive OS; **34** for Android TV and Android XR | error from 2026-08-31; message mentions that an approved extension can run to **2026-11-01** | https://developer.android.com/google/play/requirements/target-sdk |
| `AND-TSDK-002` | `targetSdkVersion` ≥ **35** so an existing app stays visible to new users on newer Android versions | warning from 2026-08-31 | same |
| `AND-16K-001` | Every 64-bit (`arm64-v8a`, `x86_64`) `.so`: all `PT_LOAD` segments have `p_align` ≥ **16384** | applies when targetSdk ≥ 35; warning until 2027-01-31, **error from 2027-02-01** | https://developer.android.com/guide/practices/page-sizes |
| `AND-16K-002` | `GNU_RELRO` end alignment: `(p_vaddr + p_memsz) % 0x4000 == 0`, **unless** the RELRO range sits in its own `PT_LOAD` segment (see source) | same timeline as 16K-001 | same |
| `AND-16K-003` | APK only: every **stored (uncompressed)** `.so` has its file data at a zip offset divisible by **16384** (`zipalign -P 16` semantics) | same timeline | same |
| `AND-16K-004` | AAB: `BundleConfig.pb` requests 16 KB alignment (`PAGE_ALIGNMENT_16K`) when native libs are uncompressed | warning, same timeline | same (bundletool section) |
| `AND-64BIT-001` | If any 32-bit ABI (`armeabi-v7a`, `x86`) ships native code, the matching 64-bit ABI is present too | error | https://developer.android.com/google/play/requirements/64-bit |
| `AND-INFO-001` | No native code / only 32-bit native code / `android:pageSizeCompat` set → explanatory info | info | page-sizes source |

Notes:
- Form factor (for `AND-TSDK-001`) is inferred from manifest `<uses-feature>`: `android.hardware.type.watch` → Wear OS; `android.software.leanback` → TV; `android.hardware.type.automotive` → Automotive; XR features → XR; otherwise phone/tablet. Show which was inferred and let the user override it in the UI and CLI (`--form-factor`).
- `targetSdkVersion` may be a preview codename string; treat as "≥ latest" with an info note. Missing `uses-sdk` → target defaults to `minSdk` (or 1): flag it.
- Things the tool **cannot** check (age-rating answers, store listing, signing identity) go in the README's "What this doesn't check" section, not in the rules.

### 3.4 Report format and verdict

Both implementations emit the **same JSON**, validated against `schema/report.schema.json` (JSON Schema 2020-12):

```json
{
  "tool": { "name": "store-ready", "version": "1.0.0", "rulesVersion": "2026.10.20" },
  "asOf": "2026-10-20",
  "input": { "fileName": "MyApp.ipa", "sizeBytes": 48211012, "kind": "ipa" },
  "app": { "platform": "ios", "id": "com.example.myapp", "version": "2.3.0", "build": "45" },
  "summary": { "status": "blocked", "errors": 2, "warnings": 1, "infos": 1 },
  "findings": [
    {
      "ruleId": "IOS-SDK-001",
      "severity": "error",
      "confidence": "certain",
      "title": "Built with Xcode 16.4 — App Store Connect requires Xcode 26",
      "message": "Uploads since 2026-04-28 must be built with Xcode 26 or later using the iOS 26 SDK.",
      "evidence": { "bundle": "Payload/MyApp.app", "DTXcode": "1640", "DTSDKName": "iphoneos18.5" },
      "fix": ["Install Xcode 26 or later", "Archive again and re-export the IPA"],
      "sources": [{ "title": "Apple — Upcoming requirements", "url": "https://developer.apple.com/news/upcoming-requirements/" }]
    }
  ]
}
```

- `status`: `blocked` (≥1 error) · `attention` (warnings only) · `ready` (no errors or warnings).
- `confidence`: `certain` (read directly from metadata) or `heuristic` (inferred, e.g. symbol scan). The UI shows a "heuristic" badge with a one-line explanation.
- Rules not yet in force as of the chosen date produce an `info` finding "Becomes required on YYYY-MM-DD".
- Findings are sorted by severity, then rule ID, then location — deterministic output is mandatory (golden tests depend on it).

### 3.5 Non-goals for v1

No accounts, no server, no uploads, no analytics, no telemetry, no cookies. No signing/provisioning validation. No App Store Connect or Play Console API calls. No auto-fixing of builds.

---

## 4. Hard constraints (never violate)

1. **Nothing leaves the device.** The only network requests the web page ever makes are same-origin `GET`s for its own static assets (HTML, JS, CSS, worker, icons): no `fetch`/XHR/WebSocket/beacon calls from app code, no third-party scripts, fonts, CDNs or analytics. `rules.json` is bundled at build time. Enforce with a Content-Security-Policy `<meta>` tag (`connect-src 'none'`) **and** with an automated Playwright test.
2. **Analysis runs in a Web Worker**; the main thread only renders.
3. **Data-driven rules**: no rule thresholds or dates hard-coded in parser or UI code. Every rule has a source URL and a retrieved date.
4. **Parity**: TypeScript core and Swift CLI produce byte-identical normalized JSON for every fixture. A CI job enforces it.
5. **Determinism**: injectable clock ("as of" date); stable sort; no randomness in output.
6. **No real third-party app binaries in the repo.** Fixtures are synthetic and generated by committed scripts; real-toolchain builds happen only inside CI. `.gitignore` and the repo check in §9.1 enforce this.
7. **Licences**: MIT for this repo; vendored `.proto` files from AOSP/bundletool are Apache-2.0 — keep their headers and list them in `THIRD_PARTY_NOTICES.md`.
8. **Free to run**: public repo, GitHub Actions standard runners and GitHub Pages only. No paid services, no secrets required for CI.
9. Wording: "Not affiliated with Apple or Google." Use the companies' names only descriptively.
10. **Every commit is linted and tested.** Git hooks run the linters and unit tests on every local commit; CI runs the full suite on every push to every branch and on every pull request. Never bypass the hooks (`--no-verify`, `LEFTHOOK=0`, changing `core.hooksPath`). If a hook is wrong or slow, fix the hook in its own commit.

---

## 5. Architecture and repository layout

```
store-ready/
├── CLAUDE.md
├── README.md · LICENSE · .gitignore · .gitattributes · CHANGELOG.md · CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md · THIRD_PARTY_NOTICES.md
├── .nvmrc · .editorconfig · package.json (npm workspaces) · tsconfig.base.json
├── eslint.config.js · .prettierrc · .prettierignore · .markdownlint-cli2.jsonc · commitlint.config.js · lefthook.yml
├── rules/
│   ├── rules.json                 # single source of truth (versioned, dated, sourced)
│   ├── apple-required-reason-apis.json
│   ├── apple-listed-sdks.json
│   └── sources.lock.json          # hashes of watched official pages (rules-watch workflow)
├── schema/
│   ├── report.schema.json
│   └── rules.schema.json
├── packages/core/                 # TS, no DOM: zip reading, parsers, rules engine, report builder
│   └── src/{zip,ios,android,rules,report,util}/
├── apps/web/                      # Vite + vanilla TypeScript UI, Web Worker, PWA
├── cli/                           # Swift package: StoreReadyCore (library) + storeready (executable)
│   ├── Package.swift · .swift-format
│   ├── Sources/{StoreReadyCore,storeready}/
│   └── Tests/{StoreReadyCoreTests,storereadyTests}/
├── proto/                         # vendored aapt2 Resources.proto, Configuration.proto, bundletool config.proto
├── fixtures/
│   ├── generators/                # TS scripts that build synthetic .ipa/.aab/.apk deterministically
│   ├── files/                     # generated fixtures (small, committed)
│   └── expected/                  # golden report JSON per fixture (default asOf 2026-10-20)
├── e2e/                           # Playwright tests
├── scripts/                       # verify.sh, sync-rules.ts, gen-rules-doc.ts, conformance.ts, record-demo.ts
├── docs/                          # BUILD_BRIEF.md, SPEC.md, ARCHITECTURE.md, RULES.md (generated), TESTING.md, CI-CD.md, PRIVACY.md, adr/, media/
├── .claude/                       # settings.json, hooks/, skills/, agents/
└── .github/                       # workflows/, dependabot.yml, CODEOWNERS, PULL_REQUEST_TEMPLATE.md, ISSUE_TEMPLATE/
```

Data flow (web): `File` → worker → zip central directory via `Blob.slice` → detect kind → extract only needed entries → platform analyzer → facts → rules engine (facts × rules × asOf) → report JSON → main thread renders.

Put a Mermaid diagram of this flow in `docs/ARCHITECTURE.md`.

---

## 6. Technical implementation notes

### 6.1 Zip reading (web)

- Use `@zip.js/zip.js` with `BlobReader` for random access (reads the central directory without loading the file), or implement a central-directory reader over `Blob.slice` plus `DecompressionStream('deflate-raw')`. Either way: stream-decompress only selected entries.
- Handle ZIP64 (large IPAs), data descriptors, stored vs deflated entries, and expose each entry's **local header data offset** (needed for `AND-16K-003`).
- Inside the worker, disable any library option that spawns further workers or blob-URL workers unless the CSP allows it (`worker-src 'self' blob:`).
- Limits: skip symbol scanning for executables larger than a configurable cap (default 600 MB) with an info finding, rather than crashing the tab.

### 6.2 iOS analysis

**Bundles to inspect:** the main app `Payload/*.app`, every app extension `*.app/PlugIns/*.appex`, App Clips `*.app/AppClips/*.app`, watch apps `*.app/Watch/*.app`, and every `*.app/Frameworks/*.framework` (plus resource bundles `*.bundle` for privacy manifests).

**Property lists:** `Info.plist` and `PrivacyInfo.xcprivacy` can be **binary** (`bplist00`) or XML. Write a small, dependency-free binary plist decoder with tests. Workers have **no `DOMParser`**, so parse XML plists with a worker-safe parser (e.g. `fast-xml-parser`) or a small hand-written plist-XML reader.

**Info.plist keys:** `CFBundleIdentifier`, `CFBundleShortVersionString`, `CFBundleVersion`, `MinimumOSVersion`, `DTXcode` (4 digits, `major = floor(n / 100)`: `1640` = 16.4, `2600` = 26.0), `DTXcodeBuild`, `DTSDKName` (e.g. `iphoneos26.0`), `DTPlatformVersion`, `DTPlatformName`. Cross-check `DTXcode` with SDK version; report both as evidence. Confirm the exact `DTXcode` format against the real Xcode 26 build produced in the real-builds workflow (§7.6) and adjust if needed.

**Mach-O executable** (`CFBundleExecutable`):
- Thin (`MH_MAGIC_64` 0xfeedfacf) or fat (`FAT_MAGIC` 0xcafebabe / `FAT_MAGIC_64` 0xcafebabf, big-endian headers) — analyse the `arm64` slice (fall back to the first slice).
- Collect imported symbol names from **three** places and union them: `LC_SYMTAB` undefined external symbols; `LC_DYLD_CHAINED_FIXUPS` imports table; legacy `LC_DYLD_INFO(_ONLY)` bind opcodes.
- Collect Objective-C selector names from `__TEXT,__objc_methname` (only if not encrypted).
- `LC_ENCRYPTION_INFO_64.cryptid ≠ 0` → `IOS-INFO-001`; skip selector scan, keep symbol scan (symbols live in `__LINKEDIT`, which is not encrypted).

**Required-reason API detection** — map evidence to categories using `rules/apple-required-reason-apis.json` (seed in Appendix A; the `rules-auditor` agent must verify it against Apple's pages before v1.0). Detection is per **bundle**: a framework's usage must be declared in **that framework's** manifest; code statically linked into the app executable must be declared in the **app's** manifest. Report the matched symbols as evidence.

**Privacy manifest validation:** keys `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes` (array of dicts with `NSPrivacyAccessedAPIType` and `NSPrivacyAccessedAPITypeReasons`). Unknown category or reason code → `IOS-PRIV-003`.

**Listed SDKs:** match framework names (and common repackaged names) against `rules/apple-listed-sdks.json` (Appendix B) → `IOS-PRIV-004` if that framework has no `PrivacyInfo.xcprivacy`.

### 6.3 Android analysis

- **AAB manifest** is protobuf (`aapt.pb.XmlNode`). Vendor `Resources.proto` + `Configuration.proto` (AOSP `frameworks/base/tools/aapt2/`) and bundletool's `config.proto`; generate TypeScript with `@bufbuild/protobuf` + `buf`, and Swift with `swift-protobuf`; commit the generated code to `packages/core/src/gen/` and `cli/Sources/StoreReadyCore/Generated/`. Read attributes by **resource ID** where possible (`android:targetSdkVersion` = `0x01010270`, `android:minSdkVersion` = `0x0101020c`) and fall back to name; values may be a compiled `prim.int_decimal_value` or a string.
- Check **every module** in the bundle (base and feature modules) for manifests and `lib/` folders.
- **APK manifest** is binary XML (AXML: string pool, resource-ID map, start/end element chunks). Write a small parser with tests.
- **ELF:** parse ELF64 little-endian headers and program headers; `PT_LOAD` = 1, `PT_GNU_RELRO` = 0x6474e552. Implement both the `p_align` rule and the RELRO rule exactly as the Android page-sizes guide describes, including the "RELRO in its own LOAD segment" exception. Only `arm64-v8a` and `x86_64` libs are subject to 16 KB rules.
- **Zip alignment (APK):** for each stored `.so`, `dataOffset % 16384 === 0`.
- **BundleConfig.pb:** read the page-alignment setting and whether native libraries are uncompressed.

### 6.4 Rules engine

`rules/rules.schema.json` defines each rule:

```json
{
  "id": "AND-16K-001",
  "platform": "android",
  "title": "64-bit native libraries must be 16 KB aligned",
  "appliesWhen": { "targetSdkAtLeast": 35, "abis": ["arm64-v8a", "x86_64"] },
  "timeline": [
    { "from": "2025-11-01", "severity": "warning" },
    { "from": "2027-02-01", "severity": "error" }
  ],
  "sources": [{ "title": "Android — Support 16 KB page sizes", "url": "https://developer.android.com/guide/practices/page-sizes", "retrieved": "2026-10-20" }],
  "fix": ["Upgrade to AGP 8.5.1+ and NDK r28+", "Rebuild or update prebuilt .so files and SDKs"]
}
```

- Analyzers produce **facts** (no judgments); the engine turns facts into findings. Rule checks are small pure functions registered by rule ID; thresholds and dates come only from `rules.json`.
- `scripts/sync-rules.ts` copies `rules/*.json` into the Swift package resources; CI fails if they drift.
- `scripts/gen-rules-doc.ts` generates `docs/RULES.md` from `rules.json`, and rewrites the rules table between `<!-- rules:start -->` and `<!-- rules:end -->` in `README.md`; CI fails if either is stale. Neither may be edited by hand.
- Bump `rulesVersion` (date-based, `YYYY.MM.DD`) whenever rule data changes.

### 6.5 Web app

- **Stack:** Vite, vanilla TypeScript (no framework needed; Preact allowed only if justified in an ADR), CSS with custom properties, light/dark via `prefers-color-scheme`.
- **Screens/states:** idle (drop zone, file picker, three "Try a sample" buttons that load bundled synthetic fixtures — used for the demo GIF), analysing (stage-by-stage progress, cancel button), result (verdict banner, counts, severity filter, expandable findings with evidence, fix steps and source links, "heuristic" badges), error (not a zip, unsupported, corrupted, too large).
- **Actions on a result:** copy report as Markdown (for an email or GitHub issue), download JSON, change the "Check as of" date and re-evaluate instantly without re-reading the file, override Android form factor.
- **Trust signals on the page:** "Your file never leaves this browser" panel explaining the worker + CSP, a link to `docs/PRIVACY.md`, and the app works offline after first load (PWA via `vite-plugin-pwa`, precache only same-origin assets).
- **Footer:** version, rules version and date, GitHub link, "Not affiliated with Apple or Google", optional contact CTA from `VITE_CONTACT_URL`.
- **CSP meta tag** (adjust only with an ADR): `default-src 'self'; script-src 'self'; worker-src 'self' blob:; connect-src 'none'; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
- **Accessibility:** WCAG 2.2 AA; full keyboard operation of the drop zone; results announced through an `aria-live` region; visible focus; colour is never the only signal.
- **Performance budgets** (enforced with `size-limit` in CI): initial JS ≤ 120 KB gzipped; worker lazy-loaded; a 500 MB synthetic IPA analysed in under 10 s on a CI runner (Chromium).
- **Browser support:** latest two versions of Chrome, Edge, Firefox, Safari (macOS and iOS).
- **SEO/social:** title, description, Open Graph image (generated, committed), `robots.txt`.
- Vite `base` must equal `/<repo>/` for GitHub Pages.

### 6.6 Swift CLI

- Swift 6 toolchain (Xcode 26), Swift Package Manager, `swift-argument-parser`, `ZIPFoundation` for zip access, `swift-protobuf`, Foundation `PropertyListSerialization` for plists. Tests with **Swift Testing** (`import Testing`).
- Extract large entries to a temporary file and memory-map them; never hold a whole archive in memory.
- Interface:

```
storeready check <file> [--format text|json|markdown] [--as-of YYYY-MM-DD]
                        [--form-factor phone|wear|tv|automotive|xr]
                        [--fail-on error|warning|never] [--no-color]
storeready rules [--format text|json]      # list rules, sources, dates
storeready --version
```

- Exit codes: `0` nothing at/above `--fail-on` (default `error`); `1` findings at/above threshold; `2` usage or parse error.
- Text output: compact, coloured when TTY, one line per finding plus evidence; JSON identical to the web report.
- Distribution: GitHub Release with a universal macOS binary (`arm64` + `x86_64`), `.sha256` checksum, and (best effort) a Linux x86_64 binary. The binary is unsigned; document `xattr -d com.apple.quarantine` in the README. Homebrew tap is a stretch goal.
- Stretch: a composite GitHub Action (`action.yml`) so other repos can run `storeready check` in CI.

---

## 7. Testing strategy (all of it runs in CI)

### 7.1 Synthetic fixtures

`fixtures/generators/*.ts` build every fixture deterministically (fixed zip timestamps, stable entry order) and write it to `fixtures/files/`. Each fixture stays under 200 KB except the performance fixture, which is generated at test time and never committed. Minimum matrix:

**iOS:** passing app (Xcode 26, min iOS 15, manifest declaring UserDefaults `CA92.1`, executable importing `NSUserDefaults`); built with Xcode 16.4; `MinimumOSVersion` 12.0; no manifest while importing `stat`; manifest present but missing `DiskSpace` while importing `statfs`; bad reason code; malformed manifest; listed SDK framework (`Alamofire.framework`) without manifest; framework with its own manifest (passes); app extension built with an old SDK; fat binary; encrypted binary; XML and binary plist variants; not a zip; zip without `Payload/`.

**Android:** AAB target 36 with aligned arm64 lib (passes); target 35; target 34; Wear OS at target 35 (passes); TV at 34 (passes); arm64 lib with 4 KB `p_align` (warning as of 2026-10-20, **error as of 2027-02-01** — test both); RELRO misaligned; RELRO in its own LOAD (passes); only `armeabi-v7a` lib (64-bit rule error); no native code; APK with stored `.so` not 16 KB zip-aligned; feature module with misaligned lib; missing `uses-sdk`; corrupt ELF.

Synthetic Mach-O and ELF binaries are minimal valid headers + load commands/program headers + symbol tables written by the generators. Every fixture has a golden report in `fixtures/expected/`.

### 7.2 Unit tests (TypeScript — Vitest)

- Each parser (zip central directory, ZIP64, bplist, XML plist, Mach-O thin/fat/chained fixups, ELF, AXML, proto manifest, BundleConfig) and each rule check.
- **Property-based tests** with `fast-check`: random and truncated bytes must never throw an uncaught exception or hang; parsers return typed errors.
- Rules engine: timeline evaluation at boundary dates (day before, day of, day after).
- Golden tests: core output for every fixture equals `fixtures/expected/*.json`.
- Coverage gate for `packages/core`: ≥ 90% lines, ≥ 85% branches.

### 7.3 Swift tests (Swift Testing)

- Same parser and rule cases as TypeScript, plus CLI integration tests that run the built executable on fixtures and assert exit codes, `--fail-on` behaviour, and JSON output.

### 7.4 Conformance (parity) tests

`scripts/conformance.ts` runs the TS core and the Swift CLI (`--format json --as-of 2026-10-20`) on every fixture, normalises (drops `tool.version`), and diffs against the golden file. Any difference fails CI.

### 7.5 UI / end-to-end tests (Playwright)

Run on Chromium, Firefox and WebKit, desktop and a mobile viewport:
- Drop or pick each sample; assert verdict, counts, specific findings and evidence text.
- Keyboard-only flow (Tab to drop zone, Enter opens picker, results reachable and readable).
- **Privacy test:** record every request for the whole session. Every request must be a same-origin `GET` for the app's own static assets (for example the lazily loaded worker script); no request may carry a body, use another method, or go to another origin. Analysing a file must add no requests other than those static-asset `GET`s.
- **Console test:** any console error during any test, including a CSP violation report, fails the test.
- **Offline test:** load once, `context.setOffline(true)`, reload, analyse a sample successfully.
- "Check as of" date change flips the 16 KB finding from warning to error.
- Copy-as-Markdown and download-JSON produce schema-valid content.
- Accessibility scan with `@axe-core/playwright` on idle, result and error states: zero violations.
- Error states: non-zip, empty file, corrupted zip.
- Post-deploy smoke test against the live URL (`BASE_URL` env var).

### 7.6 Real-toolchain tests (scheduled + manual)

`real-builds.yml` builds real artifacts inside CI and checks the checker against them:
- **macOS runner (`macos-26`, Xcode 26):** create a minimal SwiftUI app from a committed template, `xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`, zip `Payload/` into an `.ipa`; expect `ready`. Build a variant with deployment target 12.0 → expect `IOS-MINOS-001`. Record the real `DTXcode` value in the job summary.
- **Ubuntu runner (Android SDK preinstalled):** minimal app with a tiny JNI library built with NDK r28+ → `bundleRelease` → expect `ready`; variant linked with `-Wl,-z,max-page-size=4096` → expect `AND-16K-001`; variant with `targetSdk 34` → expect `AND-TSDK-001`.
- Run both the TS core (via Node) and the Swift CLI on these artifacts.

### 7.7 Linting

Every linter runs with zero warnings allowed, locally through the git hooks (§7.8) and in the CI `lint` and `swift` jobs (§8).

| What | Tool | Config file |
| --- | --- | --- |
| TypeScript and JavaScript | ESLint flat config with typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, `@vitest/eslint-plugin` for unit tests, `eslint-plugin-playwright` for e2e, `eslint-config-prettier` last; run with `--max-warnings 0` | `eslint.config.js` |
| Types | `tsc` in strict mode, no emit, every workspace | `tsconfig*.json` |
| Formatting | Prettier for TS, JS, JSON, Markdown, YAML, CSS and HTML | `.prettierrc`, `.prettierignore` (generated code, fixtures, lockfiles) |
| Swift | `swift format lint --strict` (swift-format ships with the Swift 6 toolchain; use `xcrun swift-format lint --strict` if the `swift format` subcommand isn't found); CI also builds with `-Xswiftc -warnings-as-errors` | `cli/.swift-format` |
| Markdown | markdownlint-cli2, with line length (MD013) off | `.markdownlint-cli2.jsonc` |
| GitHub workflows | actionlint | none |
| Shell scripts | shellcheck (`scripts/*.sh`, `.claude/hooks/*.sh`) | none |
| Commit messages | commitlint with `@commitlint/config-conventional` | `commitlint.config.js` |
| Data files | JSON Schema validation (Ajv) of `rules/*.json` and every golden report, as unit tests | `schema/` |
| Doc links | markdown link check on `README.md` and `docs/` (CI only) | none |

ESLint also enforces the privacy and architecture constraints, so a violation fails the commit before review. Start from this config and keep every rule in it; check each plugin's current export names when installing:

```js
// eslint.config.js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

const offDevice =
  'Store Ready never sends data off the device (hard constraint 1). Ask the owner before adding network code.';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    'packages/core/src/gen/**',
    'fixtures/files/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  {
    // Root config files (this one, commitlint.config.js) aren't in any tsconfig: lint them without types.
    files: ['*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Shipped code: no network APIs, no console output (it could leak file contents).
    files: ['apps/web/src/**/*.ts', 'packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'].map((name) => ({ name, message: offDevice })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: offDevice },
        ...['globalThis', 'self', 'window'].map((object) => ({ object, property: 'fetch', message: offDevice })),
      ],
      'no-console': 'error',
    },
  },
  {
    // The core runs inside a browser worker.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', 'fs', 'path', 'os', 'child_process'], message: 'packages/core runs in a browser worker; no Node built-ins.' }] },
      ],
    },
  },
  { files: ['**/*.test.ts'], extends: [vitest.configs.recommended] },
  { files: ['e2e/**/*.ts'], extends: [playwright.configs['flat/recommended']] },
  prettier,
]);
```

Root `package.json` scripts, used by the hooks, `verify`, CI and the docs: `lint`, `lint:fix`, `lint:swift`, `format`, `format:check`, `typecheck`, `test` (same as `test:unit`), `test:unit`, `test:e2e`, `test:swift`, `check:repo`, `verify`.

### 7.8 Checks on every commit

The git hooks are managed by **lefthook**, an npm dev dependency that installs them into `.git/hooks/` when anyone runs `npm ci` or `npm install`. If the hooks don't appear after a fresh `npm ci`, add `"prepare": "lefthook install"`. In CI, where `CI=true`, the hooks aren't installed; the workflows run the same commands directly.

| When | Hook | What runs | Time budget |
| --- | --- | --- | --- |
| Every `git commit`, by you or Claude Code | `pre-commit` | 1. Fix the staged files: ESLint `--fix`, Prettier, `swift format`; re-stage them. 2. Then, in parallel: lint the staged files (Swift, Markdown, workflows, shell); `typecheck`; repo check; **all TypeScript unit tests**, including golden and property tests; Swift tests when files under `cli/`, `rules/`, `schema/` or `fixtures/` are staged | ≤ 60 s |
| Every commit message | `commit-msg` | commitlint | ≤ 2 s |
| Every `git push` | `pre-push` | `scripts/verify.sh`: everything CI runs except e2e | ≤ 3 min |
| Every push to any branch, every pull request | CI (`ci.yml`) | `lint`, unit tests with coverage, e2e on 3 browsers, Swift build and tests, conformance | CI |

Start from this `lefthook.yml`. It uses `glob_matcher: doublestar` so that `**/*.ts` matches root-level and nested files alike:

```yaml
# lefthook.yml
glob_matcher: doublestar

pre-commit:
  piped: true
  jobs:
    - name: fix
      group:
        piped: true
        jobs:
          - name: eslint-fix
            glob: "**/*.{ts,mts,cts,js,mjs,cjs}"
            exclude:
              - "packages/core/src/gen/**"
              - "fixtures/files/**"
            run: npx eslint --fix --max-warnings 0 --no-warn-ignored {staged_files}
            stage_fixed: true
          - name: prettier
            glob: "**/*.{ts,mts,cts,js,mjs,cjs,json,md,yml,yaml,css,html}"
            run: npx prettier --write {staged_files}
            stage_fixed: true
          - name: swift-format
            glob: "**/*.swift"
            exclude:
              - "cli/Sources/StoreReadyCore/Generated/**"
            run: swift format --in-place {staged_files}
            stage_fixed: true
    - name: check
      group:
        parallel: true
        jobs:
          - name: swift-lint
            glob: "**/*.swift"
            exclude:
              - "cli/Sources/StoreReadyCore/Generated/**"
            run: swift format lint --strict {staged_files}
          - name: markdownlint
            glob: "**/*.md"
            run: npx markdownlint-cli2 {staged_files}
          - name: actionlint
            glob: ".github/workflows/*.{yml,yaml}"
            run: actionlint {staged_files}
            fail_text: "Needs actionlint: brew install actionlint"
          - name: shellcheck
            glob: "**/*.sh"
            run: shellcheck {staged_files}
            fail_text: "Needs shellcheck: brew install shellcheck"
          - name: typecheck
            run: npm run typecheck
          - name: repo-check
            run: npm run check:repo
          - name: unit-tests
            run: npm run test:unit
          - name: swift-tests
            glob:
              - "cli/**"
              - "rules/**"
              - "schema/**"
              - "fixtures/**"
            run: swift test --package-path cli

commit-msg:
  jobs:
    - name: commitlint
      run: npx --no -- commitlint --edit {1}

pre-push:
  jobs:
    - name: verify
      run: ./scripts/verify.sh
```

Rules for the hooks:

- **Prove they work.** `scripts/test-git-hooks.sh` installs the hooks in a temporary clone and asserts four things: a commit with an ESLint error is rejected; a commit that breaks a unit test is rejected; a commit with the message `fixed stuff` is rejected; a badly formatted file is fixed and re-staged. It runs in `verify --full` and in the CI `lint` job (with `LEFTHOOK=1`).
- **Keep them fast.** If the unit suite pushes `pre-commit` past 60 s, switch that job to `vitest related --run {staged_files}`, plus a full run when files under `rules/`, `schema/`, `fixtures/` or any config change. Record the switch in an ADR. Never drop tests from the hook.
- **Every commit is covered.** The hooks test each commit as it is made. CI tests the tip of every push, and squash merges mean every commit on `main` has passed CI.
- **Prerequisites** go in the README's Develop section and `CONTRIBUTING.md`: Node from `.nvmrc`, Xcode 26 (or the Swift 6 toolchain on Linux), and `brew install actionlint shellcheck`.

---

## 8. CI/CD, GitHub setup and hosting

**Hosting:** GitHub Pages (free for public repos), deployed by GitHub Actions. Live URL: `https://<owner>.github.io/<repo>/`. Document Cloudflare Pages as an optional later upgrade (real HTTP headers, PR previews) in an ADR; don't implement it.

**Workflows** (pin every third-party action to a full commit SHA; set least-privilege `permissions` per workflow; add `concurrency` groups):

| File | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | push to **any** branch, pull_request, `workflow_dispatch` | `lint` (ubuntu: every linter in §7.7, `typecheck`, commitlint over every commit in the push or PR range, doc link check, `scripts/test-git-hooks.sh`) · `web` (ubuntu: install, repo check, unit + coverage, build, size-limit, rules-sync and rules-doc freshness checks) · `e2e` (ubuntu: Playwright, 3 browsers, upload report on failure) · `swift` (`macos-26`: `swift format lint --strict --recursive`, build with warnings as errors, test) · `swift-linux` (ubuntu, official Swift toolchain; best effort) · `conformance` (`macos-26`: build both, run parity script) |
| `deploy.yml` | push to `main` after `ci.yml` succeeds; `workflow_dispatch` | build site → `actions/upload-pages-artifact` → `actions/deploy-pages` → Playwright smoke test against the live URL |
| `release.yml` | tag `v*.*.*` | build universal macOS CLI (+ Linux), checksums, GitHub Release with notes from `CHANGELOG.md` |
| `real-builds.yml` | weekly schedule, `workflow_dispatch` | §7.6 |
| `rules-watch.yml` | weekly schedule, `workflow_dispatch` | fetch the official pages listed in `rules/sources.lock.json`, hash the relevant text, open (or update) a GitHub issue labelled `rules-change` when a hash changes |
| `codeql.yml` | pull_request, push, weekly | CodeQL for JavaScript/TypeScript |

**Repo configuration** (via `gh` if available, otherwise give me click-paths): Pages source = GitHub Actions; branch protection on `main` requiring `lint`, `web`, `e2e`, `swift`, `conformance` checks and linear history; squash merges only; Dependabot for npm, Swift packages and GitHub Actions (`.github/dependabot.yml`); secret scanning and push protection on; repo description, topics (`ios`, `android`, `app-store`, `google-play`, `privacy-manifest`, `16kb-page-size`, `developer-tools`), homepage = live URL; `CODEOWNERS`; PR template with a checklist (tests, rules sources, docs, parity); issue templates (bug report with "attach the JSON report, never the binary", rule-change request).

**Versioning:** SemVer for the tool, date-based `rulesVersion` for rule data, Conventional Commits, `CHANGELOG.md` in Keep a Changelog format.

---

## 9. Files to generate in Milestone 0 (before any product code)

Create these first, commit them, and keep them current as the project evolves. Follow Claude Code's current conventions: project skills at `.claude/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`, optional `disable-model-invocation`, `allowed-tools`, `paths`); project subagents at `.claude/agents/<name>.md` with frontmatter `name`, `description`, `tools`, optional `model`; settings and hooks in `.claude/settings.json`. Keep each `SKILL.md` under 500 lines and move long reference material into supporting files in the skill folder.

### 9.1 Repository basics: README, LICENSE, .gitignore (the first commit)

Create these files before anything else, from the contents below, and commit them as `chore: add README, LICENSE, .gitignore and .gitattributes`. Commit `.env.example` (containing only `VITE_CONTACT_URL=`) in the same commit.

#### `LICENSE`

Use the MIT License text below word for word. It is GitHub's template, so GitHub detects it and shows "MIT license" in the repo sidebar. The year is `2026`; the holder is the answer to question 2 in §2. Also set `"license": "MIT"` in every `package.json`. List the vendored Apache-2.0 `.proto` files in `THIRD_PARTY_NOTICES.md`, not in `LICENSE`.

```text
MIT License

Copyright (c) 2026 <COPYRIGHT HOLDER>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

#### `.gitignore`

Start from exactly this. Add patterns when a new tool creates output; never remove the app-binary guard. Comments must sit on their own lines, because git treats text after a pattern as part of the pattern.

```gitignore
# --- Dependencies ---
node_modules/

# --- Build output ---
dist/
*.tsbuildinfo
.vite/
# vite-plugin-pwa development service worker
apps/web/dev-dist/

# --- Test output ---
coverage/
playwright-report/
test-results/
blob-report/
/playwright/.cache/
# Large fixtures created at test time (e.g. the 500 MB performance IPA); never commit
fixtures/generated/

# --- Swift / Xcode ---
.build/
.swiftpm/
DerivedData/
xcuserdata/
*.xcuserstate

# --- Real app builds: never commit them (synthetic fixtures are the only exception) ---
*.ipa
*.aab
*.apk
*.xcarchive/
*.dSYM/
*.dSYM.zip
!fixtures/files/**/*.ipa
!fixtures/files/**/*.aab
!fixtures/files/**/*.apk

# --- Demo recording intermediates (final GIFs in docs/media/ are committed) ---
docs/media/raw/

# --- Secrets and local environment ---
.env
.env.*
!.env.example

# --- Claude Code personal files (the shared .claude/ config IS committed) ---
.claude/settings.local.json
.claude/worktrees/
CLAUDE.local.md

# --- Logs and caches ---
*.log
npm-debug.log*
.eslintcache
.cache/

# --- OS and editors ---
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
*.swp
```

These files are generated but **committed**, because CI checks them for freshness, so they must never be ignored: `docs/RULES.md`, the rules table in `README.md`, generated proto code, the rules copy in `cli/Sources/StoreReadyCore/Resources/`, `fixtures/files/**` and `fixtures/expected/**`. Lockfiles (`package-lock.json`, `cli/Package.resolved`) are committed too.

#### `.gitattributes`

Keeps binary fixtures from being corrupted by line-ending conversion and collapses generated files in GitHub diffs:

```gitattributes
* text=auto eol=lf
fixtures/files/** binary
*.gif binary
*.png binary
*.ico binary
docs/RULES.md linguist-generated=true
packages/core/src/gen/** linguist-generated=true
cli/Sources/StoreReadyCore/Generated/** linguist-generated=true
cli/Sources/StoreReadyCore/Resources/** linguist-generated=true
```

#### `README.md`

Write this honest "in development" version in M0, replacing `<owner>` and `<repo>`. Keep the commands in sync with `CLAUDE.md`.

````markdown
# Store Ready

Check an iOS or Android build against the current App Store Connect and Google Play upload rules before you upload it. It runs in your browser, and your file is never uploaded.

[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Status: in development.** The web checker will be live at https://<owner>.github.io/<repo>/ after Milestone 5. Progress is in [CHANGELOG.md](CHANGELOG.md).

## What it checks

<!-- rules:start -->
<!-- rules:end -->

Sources and dates for every rule: [docs/RULES.md](docs/RULES.md).

## Privacy

Your build is read by a Web Worker inside your browser and is never sent anywhere. A Content-Security-Policy blocks outgoing data, and an automated test proves it. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Develop

```bash
npm ci                # install dependencies and the git hooks
npm run dev           # web app at http://localhost:5173/<repo>/
npm run lint          # every linter
npm test              # unit tests
./scripts/verify.sh   # what CI checks, quickly
```

Needs Node (version in `.nvmrc`), Xcode 26 for the Swift CLI, and `brew install actionlint shellcheck`. Every commit runs the linters and unit tests through git hooks; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

[Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [CI/CD](docs/CI-CD.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE). Not affiliated with Apple or Google.
````

`scripts/gen-rules-doc.ts` fills the block between the `rules:start` and `rules:end` markers with a table (rule ID, platform, one-line check, in force from).

**Final README, complete by M6, in this order:** title and one-line pitch → web demo GIF → "Try it: <live URL>" → badges (CI, deploy, release, licence) → what it checks (generated table and link to RULES.md) → privacy in two sentences → CLI: install from GitHub Releases, checksum, the `xattr` note, usage and the CLI GIF → use in CI (example workflow step) → what it doesn't check → how it works (link to ARCHITECTURE) → develop → contributing → licence and disclaimer.

README rules:

- At the end of every milestone, update the status line and a short "Works today" list, so the README never claims anything that hasn't shipped.
- Link repo content with relative paths. GIFs live in `docs/media/` and stay under 4 MB each.
- Add the deploy and release badges in M5, when those workflows exist.

#### Repo check (`scripts/check-repo.ts`)

`verify` and the CI `web` job run this check. It fails when any of these is true:

- `README.md`, `LICENSE`, `.gitignore`, `.gitattributes` or `.env.example` is missing.
- `LICENSE` differs from the MIT text above, ignoring whitespace, or has the wrong year or holder.
- A `package.json` lacks `"license": "MIT"`.
- A tracked `.ipa`, `.aab`, `.apk`, `.xcarchive` or `.dSYM` sits outside `fixtures/files/`, using `git ls-files`.
- A tracked file under `fixtures/files/` is over 200 KB, or any tracked file is over 5 MB.
- A tracked file matches `.gitignore`: `git ls-files --cached --ignored --exclude-standard` prints anything.
- A relative link or image in `README.md` doesn't resolve, or its rules block is stale.

### 9.2 `CLAUDE.md` (project memory — keep under ~150 lines)

Must contain: one-paragraph product summary; the hard constraints from §4 verbatim as a numbered list; repo map; exact commands (install, dev server, lint, format, typecheck, unit tests, e2e, Swift build/test, conformance, generate fixtures, sync rules, generate rules doc, verify); coding conventions (TS strict, no `any`, pure parsers returning typed results, no DOM in `packages/core`, Swift 6 strict concurrency); definition of done for any change (tests + fixtures + golden files + docs + parity + `verify` passes); "never edit `docs/RULES.md`, the README rules block or generated proto code by hand"; "never commit an app binary outside `fixtures/files/`"; how to add a rule (point to the `add-store-rule` skill).

### 9.3 Skills (`.claude/skills/`)

| Skill folder | Type | What it must contain |
| --- | --- | --- |
| `verify/` | task, Claude may invoke | Runs `scripts/verify.sh`: repo check (§9.1), every linter in §7.7, typecheck, unit tests, Swift tests when on macOS, conformance, rules sync and doc freshness. Fast (< 3 min); e2e only with `--full`. Naming it `verify` makes Claude Code run it before each commit. |
| `ipa-analysis/` | reference, `paths: packages/core/src/ios/**, cli/Sources/**` | IPA layout and bundle types, plist formats and the worker `DOMParser` gotcha, DT keys with examples, Mach-O structures and constants (fat, load commands, chained fixups, encryption), required-reason detection approach and per-bundle attribution, encrypted-IPA limits, links to Apple sources. Supporting file `reference.md` for byte layouts. |
| `android-bundle-analysis/` | reference, `paths: packages/core/src/android/**, cli/Sources/**` | AAB vs APK layout, proto manifest decoding with resource IDs, AXML chunk format, ELF program headers, the exact 16 KB and RELRO rules, zip alignment, BundleConfig, form-factor inference, Play target-SDK table, sources. |
| `add-store-rule/` | task | Step-by-step: confirm the rule on the official page (WebFetch), add or modify `rules.json` with source URL + retrieved date + timeline, write the check, add fixtures + golden files for pass/fail/boundary dates, TS + Swift tests, sync rules, regenerate `RULES.md`, bump `rulesVersion`, update `CHANGELOG.md`, run `verify`. |
| `make-fixture/` | task | How to add a generator, determinism requirements, size limits, never commit real apps, regenerate goldens and review the diff deliberately. |
| `release/` | task, `disable-model-invocation: true` | Pre-flight (`verify --full`, CHANGELOG), version bump in `package.json` + Swift, tag, push, watch `release.yml` and `deploy.yml`, confirm assets/checksums and the live smoke test. |
| `record-demo/` | task, `disable-model-invocation: true` | Record the web demo with Playwright video (sample → blocked report → change "as of" date) and convert to GIF with `ffmpeg` palette generation (≤ 4 MB, 800 px wide); record the CLI demo with a VHS `.tape` file; save to `docs/media/`; update README. |

### 9.4 Subagents (`.claude/agents/`)

| Agent | Tools | Purpose |
| --- | --- | --- |
| `privacy-guardian` | Read, Grep, Glob, Bash | Reviews a diff for anything that could send data off-device or weaken the CSP: network APIs, third-party URLs, new dependencies with network behaviour, logging of file contents. Returns pass/fail with file:line evidence. Use before every merge that touches `apps/web` or `packages/core`. |
| `rules-auditor` | Read, Grep, Glob, WebFetch | Re-reads every official source in `rules.json`, `apple-required-reason-apis.json` and `apple-listed-sdks.json`; reports mismatches in values, dates and wording. Read-only. |
| `parity-checker` | Read, Grep, Glob, Bash | Runs conformance, explains any TS/Swift divergence and proposes the fix in the implementation that is wrong. |
| `test-engineer` | all | Writes missing unit/e2e tests and fixtures for a given change and raises coverage on weak modules. |

### 9.5 `.claude/settings.json` and hooks

- `permissions.allow` for routine commands: `npm run *`, `npx vitest *`, `npx playwright *`, `npx eslint *`, `npx prettier *`, `npx lefthook *`, `swift build *`, `swift test *`, `node scripts/*`, `git status`, `git diff *`, `gh run *`, `gh pr *`.
- `permissions.deny`: reading `.env*` files.
- `PostToolUse` hook on `Edit|Write` → `.claude/hooks/format.sh` formats the touched file with Prettier (TS/JSON/MD) or `swift-format` (Swift).
- `PreToolUse` hook on `Edit|Write` → `.claude/hooks/protect-generated.sh` blocks edits to `docs/RULES.md`, generated proto code (`packages/core/src/gen/**`, `cli/Sources/StoreReadyCore/Generated/**`) and `fixtures/files/**` (exit code 2 with a message saying which script to run instead).
- `PreToolUse` hook on `Bash` → `.claude/hooks/block-hook-bypass.sh` blocks any command that would skip the git hooks: `--no-verify`, `git commit -n`, `LEFTHOOK=0` or `LEFTHOOK=false`, and changes to `core.hooksPath`. Exit code 2 with the message "Git hooks are mandatory (hard constraint 10). Fix the failure instead."
- Hook scripts read the edited path or command from the JSON on stdin (`tool_input.file_path`), are referenced as `"$CLAUDE_PROJECT_DIR"/.claude/hooks/<script>.sh`, and are committed with the executable bit set. Check the current hooks reference (Appendix C) before writing them.

### 9.6 Documentation set

`README.md` (see §9.1), `docs/SPEC.md` (this brief's §3 refined into acceptance criteria), `docs/ARCHITECTURE.md` (Mermaid diagrams, module boundaries, worker protocol), `docs/RULES.md` (generated), `docs/TESTING.md` (how to run each layer, fixture matrix), `docs/CI-CD.md` (workflow map, required checks, how deploy and release work), `docs/PRIVACY.md` (what runs where, CSP, how to verify no uploads yourself in DevTools), `docs/adr/0001…` (client-only analysis; zip strategy; GitHub Pages; separate Swift implementation with conformance tests; vanilla TS UI; protobuf codegen; lefthook for git hooks), `CONTRIBUTING.md` (prerequisites, what each git hook runs, Conventional Commits, never bypassing hooks), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `THIRD_PARTY_NOTICES.md`, `CHANGELOG.md`.

---

## 10. Milestones (stop after each for my review)

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | **Bootstrap**: questions answered; README, LICENSE, `.gitignore`, `.gitattributes` and `.env.example` as the first commit (§9.1); repo tooling (npm workspaces, TS, Vitest, Playwright, Swift package skeleton); every linter from §7.7 and the git hooks from §7.8 (lefthook, commitlint), proved by `scripts/test-git-hooks.sh`; every other file in §9; schemas; `rules/rules.json` with every v1 rule from §3.3 as data (checks come in M1 and M2), so the README rules table generates; repo check; CI (`ci.yml`) with the `lint` job | `verify` passes; a commit with a lint error, a failing unit test or a non-conventional message is rejected locally; CI runs on a pushed feature branch and is green on `main`; skills visible in `/skills`; GitHub shows "MIT license" in the repo sidebar; README renders with a passing CI badge and the rules table |
| M1 | **iOS core (TS)**: zip reader, plists, Info.plist facts, Mach-O, privacy manifests, required-reason detection, rules `IOS-*`, generators + goldens | All iOS fixtures pass golden tests; property tests pass; coverage gate met |
| M2 | **Android core (TS)**: AAB proto + APK AXML manifests, form factor, ELF + RELRO, zip alignment, BundleConfig, rules `AND-*`, generators + goldens | All Android fixtures pass, including the 2027-02-01 boundary |
| M3 | **Web app**: worker, UI states, samples, as-of control, copy/download, PWA, CSP, a11y, budgets; e2e suite incl. privacy and offline tests | Playwright green on 3 browsers; axe clean; size-limit passes |
| M4 | **Swift CLI**: full parity, text/JSON/Markdown output, exit codes, tests, conformance job | Conformance identical on every fixture; Swift tests green on `macos-26` |
| M5 | **CI/CD + hosting**: all workflows in §8, repo settings, Pages live, release `v0.9.0` with binaries, real-builds and rules-watch workflows passing | Live URL loads and passes smoke test; release assets downloadable; real-builds green |
| M6 | **Launch polish**: `rules-auditor` pass and fixes, README with both GIFs, docs complete, OG image, `v1.0.0` release | Launch checklist (§11) fully ticked |

At the end of each milestone: run `verify` (with `--full` from M3), commit with Conventional Commits, push, confirm CI is green, update `CHANGELOG.md` and the README's status line and "Works today" list, and send me a short summary: what shipped, test counts, anything you assumed, and what's next.

---

## 11. Launch checklist (definition of done for v1.0.0)

- [ ] Live URL on GitHub Pages works on desktop and iPhone Safari, offline after first load
- [ ] Dropping a real Xcode 26 `.ipa` and a real `.aab` gives correct results (from real-builds workflow artifacts)
- [ ] Privacy e2e test proves analysis sends nothing anywhere (only same-origin static-asset GETs); CSP present in the deployed HTML
- [ ] All CI checks required and green; coverage gate met; conformance identical
- [ ] `v1.0.0` GitHub Release with macOS universal binary and checksums
- [ ] README in the final order from §9.1: demo GIF (web) at the top, CLI GIF in the CLI section, live URL, badges, limitations, disclaimer; status line says released
- [ ] `LICENSE` is the MIT text with the right holder, and GitHub shows "MIT license" in the sidebar
- [ ] Repo check passes: no app binaries outside `fixtures/files/`, no tracked file matching `.gitignore`
- [ ] Every commit runs the linters and unit tests through the git hooks, `scripts/test-git-hooks.sh` passes, and `lint` is a required CI check
- [ ] `docs/RULES.md` generated, every rule with a source and retrieved date; `rules-auditor` reports no mismatches
- [ ] Repo description, topics and homepage set; issue/PR templates in place

---

## 12. Working agreements

- Plan before each milestone (plan mode); keep a task list; one logical change per commit.
- Write tests with or before code. Never mark a task done while tests fail, and never weaken a test or a coverage gate to make CI pass.
- Never bypass the git hooks, and never silence a lint rule to get a commit through. An `eslint-disable` comment needs a one-line reason, and the `privacy-guardian` agent reviews any that touch the network rules.
- When an official source contradicts this brief, the official source wins: update `rules.json` and tell me.
- When you're unsure about a binary format detail, prove it with a real artifact in `real-builds.yml` rather than guessing.
- Ask me before: adding a runtime dependency to the web bundle, changing the CSP, changing hosting, or making anything that touches the network.

---

## Appendix A — Seed data: Apple required-reason API categories (verify before v1.0)

Starting point for `rules/apple-required-reason-apis.json`. The `rules-auditor` agent must confirm every category, reason code and symbol against Apple's documentation (https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api and the linked `NSPrivacyAccessedAPIType` pages) and record the retrieval date.

| Category (`NSPrivacyAccessedAPIType`) | Reason codes to verify | Detection evidence (imported symbols / selectors) |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `DDA9.1`, `C617.1`, `3B52.1`, `0A2A.1` | `_stat`, `_fstat`, `_fstatat`, `_lstat`, `_getattrlist`, `_fgetattrlist`, `_getattrlistat`, `_getattrlistbulk`, `_NSFileCreationDate`, `_NSFileModificationDate`, `_NSURLContentModificationDateKey`, `_NSURLCreationDateKey` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1`, `8FFB.1`, `3D61.1` | `_mach_absolute_time`; selector `systemUptime` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `85F4.1`, `E174.1`, `7D9E.1`, `B728.1` | `_statfs`, `_statvfs`, `_fstatfs`, `_fstatvfs`, `_NSFileSystemFreeSize`, `_NSFileSystemSize`, `_NSURLVolumeAvailableCapacityKey`, `_NSURLVolumeAvailableCapacityForImportantUsageKey`, `_NSURLVolumeAvailableCapacityForOpportunisticUsageKey`, `_NSURLVolumeTotalCapacityKey` |
| `NSPrivacyAccessedAPICategoryActiveKeyboards` | `3EC4.1`, `54BD.1` | selector `activeInputModes` |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1`, `1C8F.1`, `C56D.1`, `AC6B.1` | `_OBJC_CLASS_$_NSUserDefaults` |

## Appendix B — Apple's listed third-party SDKs (as published 2026-10-20)

Source: https://developer.apple.com/support/third-party-SDK-requirements/ — store in `rules/apple-listed-sdks.json` and keep in sync via `rules-watch.yml`.

Abseil, AFNetworking, Alamofire, AppAuth, BoringSSL / openssl_grpc, Capacitor, Charts, connectivity_plus, Cordova, device_info_plus, DKImagePickerController, DKPhotoGallery, FBAEMKit, FBLPromises, FBSDKCoreKit, FBSDKCoreKit_Basics, FBSDKLoginKit, FBSDKShareKit, file_picker, FirebaseABTesting, FirebaseAuth, FirebaseCore, FirebaseCoreDiagnostics, FirebaseCoreExtension, FirebaseCoreInternal, FirebaseCrashlytics, FirebaseDynamicLinks, FirebaseFirestore, FirebaseInstallations, FirebaseMessaging, FirebaseRemoteConfig, Flutter, flutter_inappwebview, flutter_local_notifications, fluttertoast, FMDB, geolocator_apple, GoogleDataTransport, GoogleSignIn, GoogleToolboxForMac, GoogleUtilities, grpcpp, GTMAppAuth, GTMSessionFetcher, hermes, image_picker_ios, IQKeyboardManager, IQKeyboardManagerSwift, Kingfisher, leveldb, Lottie, MBProgressHUD, nanopb, OneSignal, OneSignalCore, OneSignalExtension, OneSignalOutcomes, OpenSSL, OrderedSet, package_info, package_info_plus, path_provider, path_provider_ios, Promises, Protobuf, Reachability, RealmSwift, RxCocoa, RxRelay, RxSwift, SDWebImage, share_plus, shared_preferences_ios, SnapKit, sqflite, Starscream, SVProgressHUD, SwiftyGif, SwiftyJSON, Toast, UnityFramework, url_launcher, url_launcher_ios, video_player_avfoundation, wakelock, webview_flutter_wkwebview.

## Appendix C — Official sources

- Apple upcoming requirements: https://developer.apple.com/news/upcoming-requirements/
- Apple required-reason APIs: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Apple privacy manifest files: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Apple third-party SDK requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Google Play target API level: https://developer.android.com/google/play/requirements/target-sdk
- Android 16 KB page sizes: https://developer.android.com/guide/practices/page-sizes
- Google Play 64-bit requirement: https://developer.android.com/google/play/requirements/64-bit
- GitHub Actions runner images (use `macos-26` for Xcode 26): https://github.com/actions/runner-images
- Claude Code skills: https://code.claude.com/docs/en/skills · subagents: https://code.claude.com/docs/en/sub-agents · hooks: https://code.claude.com/docs/en/hooks-guide · memory: https://code.claude.com/docs/en/memory
