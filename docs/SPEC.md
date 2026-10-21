# Spec

Acceptance criteria for Store Ready v1, refined from [`docs/BUILD_BRIEF.md`](BUILD_BRIEF.md) §3.

## Users and job to be done

- **Mobile developer / agency**: "Will this upload be rejected, and exactly what do I fix?"
- **CI pipeline**: fail the build before upload if a store rule is violated.
- **Client without a developer**: "Is my app's update going to be blocked?" — a readable report
  plus a contact link.

## Inputs

| Input  | Platform     | Notes                                                                                                            |
| ------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `.ipa` | iOS / iPadOS | Zip with `Payload/<Name>.app/`. App Store-downloaded IPAs are FairPlay-encrypted: detect and degrade gracefully. |
| `.aab` | Android      | Zip; protobuf manifests per module, native libs at `<module>/lib/<abi>/*.so`, `BundleConfig.pb` at root.         |
| `.apk` | Android      | Binary XML (AXML) manifest; `lib/<abi>/*.so`; zip alignment matters.                                             |

Files can be 1–2 GB. The analyzer reads the zip central directory and only the entries it needs —
never the whole archive into memory.

## Rules (v1)

Every rule lives as data in `rules/rules.json` — see [`docs/RULES.md`](RULES.md) (generated) for
the current table, including severity timelines and official sources. Rule IDs in scope for v1:
`IOS-SDK-001`, `IOS-MINOS-001`, `IOS-PRIV-001..004`, `IOS-INFO-001`, `AND-TSDK-001/002`,
`AND-16K-001..004`, `AND-64BIT-001`, `AND-INFO-001`.

Acceptance criteria per rule:

- Backed by an official source URL and a retrieved date.
- Evaluated "as of" a user-selectable date, against a severity timeline (not a hard-coded
  threshold).
- `certain` findings come from metadata read directly off the bundle; `heuristic` findings come
  from inference (e.g. a symbol scan) and are badged as such in the report and UI.

## Report format and verdict

Both the web app and the CLI emit the same JSON, validated against
[`schema/report.schema.json`](../schema/report.schema.json) (JSON Schema 2020-12). `summary.status`
is `blocked` (≥1 error), `attention` (warnings only), or `ready` (neither). Findings are sorted by
severity, then rule ID, then location, for deterministic golden tests.

## Non-goals for v1

No accounts, no server, no uploads, no analytics, no telemetry, no cookies, no signing/provisioning
validation, no App Store Connect / Play Console API calls, no auto-fixing of builds. Things the
tool cannot check (age-rating answers, store listing content, signing identity) are documented in
the README's "What this doesn't check" section, not treated as rules.
