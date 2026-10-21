---
name: android-bundle-analysis
description: Reference for parsing .aab and .apk — manifest formats (protobuf and AXML), ELF program headers, the 16 KB page-size and RELRO rules, zip alignment, BundleConfig, and form-factor inference. Load when touching packages/core/src/android/** or the matching Swift sources.
paths: packages/core/src/android/**, cli/Sources/**
---

## AAB vs APK layout

- **AAB**: a zip of modules. Manifest is protobuf (`aapt.pb.XmlNode`) at
  `<module>/manifest/AndroidManifest.xml` for the base module, same path per feature module.
  Native libs at `<module>/lib/<abi>/*.so`. `BundleConfig.pb` sits at the zip root.
- **APK**: manifest is binary XML (AXML) at `AndroidManifest.xml`. Native libs at `lib/<abi>/*.so`.
  Zip alignment of stored entries matters for the 16 KB rules.

Check **every module** (base and every feature module) for manifests and `lib/` folders — a
feature-only native lib can still violate the 16 KB or 64-bit rules.

## Protobuf manifest (AAB)

Vendor `Resources.proto` + `Configuration.proto` (AOSP `frameworks/base/tools/aapt2/`) and
bundletool's `config.proto` under `proto/`; generate TypeScript (`@bufbuild/protobuf` + `buf`) into
`packages/core/src/gen/` and Swift (`swift-protobuf`) into
`cli/Sources/StoreReadyCore/Generated/` — both committed, both `linguist-generated=true`, neither
edited by hand.

Read attributes by **resource ID** where possible, falling back to name:

- `android:targetSdkVersion` = `0x01010270`
- `android:minSdkVersion` = `0x0101020c`

A resource value may be a compiled `prim.int_decimal_value` or a plain string; handle both.
Missing `uses-sdk` → target defaults to `minSdk` (or `1` if that's absent too) — flag it rather
than silently assuming a value. `targetSdkVersion` may be a preview codename string: treat it as
"≥ latest" with an info note, never as a parse error.

## AXML (APK manifest)

Binary XML: a string pool chunk, a resource-ID map chunk, then start/end element chunks. Write a
small parser with its own tests — see `reference.md` for the chunk header layout.

## Form-factor inference

From manifest `<uses-feature>`:

| Feature                            | Form factor  |
| ---------------------------------- | ------------ |
| `android.hardware.type.watch`      | Wear OS      |
| `android.software.leanback`        | TV           |
| `android.hardware.type.automotive` | Automotive   |
| (an XR feature)                    | XR           |
| none of the above                  | phone/tablet |

Show which was inferred and let the user override it (web UI control, CLI `--form-factor`).

## Play target-SDK requirement (data-driven — see `AND-TSDK-001`/`002` in `rules/rules.json`)

Per-form-factor minimums live in that rule's `parameters.targetSdkByFormFactor`, never hard-coded
in the check function.

## ELF and the 16 KB page-size rules

ELF64 little-endian. `PT_LOAD = 1`, `PT_GNU_RELRO = 0x6474e552`. Only `arm64-v8a` and `x86_64` libs
are subject to the 16 KB rules (`AND-16K-001..004`); see `reference.md` for program-header layout.

- **`p_align`** (`AND-16K-001`): every `PT_LOAD` segment needs `p_align >= 16384`.
- **RELRO** (`AND-16K-002`): `(p_vaddr + p_memsz) % 0x4000 == 0`, **unless** the RELRO range sits
  in its own `PT_LOAD` segment — implement this exception exactly as the Android guide describes,
  don't skip it.
- **Zip alignment** (`AND-16K-003`, APK only): for each stored (uncompressed) `.so`, its file data
  offset (the local header's data offset, not the central-directory offset) must be divisible by
  16384 (`zipalign -P 16` semantics).
- **BundleConfig** (`AND-16K-004`, AAB only): read whether `BundleConfig.pb` requests
  `PAGE_ALIGNMENT_16K` when native libs are uncompressed.

## Sources

- <https://developer.android.com/google/play/requirements/target-sdk>
- <https://developer.android.com/guide/practices/page-sizes>
- <https://developer.android.com/google/play/requirements/64-bit>
