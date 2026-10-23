---
name: ipa-analysis
description: Reference for parsing .ipa bundles — layout, plists, Mach-O structures, required-reason API detection, privacy manifests, and encrypted-binary limits. Load when touching packages/core/src/ios/** or the matching Swift sources.
paths: packages/core/src/ios/**, cli/Sources/**
---

## Bundles to inspect

Per `.ipa`: the main app `Payload/*.app`, every app extension `*.app/PlugIns/*.appex`, App Clips
`*.app/AppClips/*.app`, watch apps `*.app/Watch/*.app`, every `*.app/Frameworks/*.framework`, and
resource bundles `*.bundle` (which can carry their own `PrivacyInfo.xcprivacy`). Required-reason
API detection and privacy-manifest validation are evaluated **per bundle**, not just for the main
app — a framework's usage must be declared in that framework's own manifest.

App Store-downloaded IPAs are FairPlay-encrypted (`cryptid != 0` on the main executable): detect
this (`IOS-INFO-001`) and degrade gracefully — skip the selector scan but keep the symbol scan
(`__LINKEDIT`, where symbols live, is not encrypted).

## Property lists

`Info.plist` and `PrivacyInfo.xcprivacy` can be binary (`bplist00` magic) or XML. Workers have no
`DOMParser`, so XML plists need a worker-safe parser (e.g. `fast-xml-parser`) or a small
hand-written reader. Write a dependency-free binary plist decoder with its own tests — see
`reference.md` for the `bplist00` byte layout.

Key `Info.plist` fields: `CFBundleIdentifier`, `CFBundleShortVersionString`, `CFBundleVersion`,
`MinimumOSVersion`, `DTXcode` (4 digits: `major = floor(n / 100)`, so `1640` = 16.4, `2600` = 26.0),
`DTXcodeBuild`, `DTSDKName` (e.g. `iphoneos26.0`), `DTPlatformVersion`, `DTPlatformName`.
Cross-check `DTXcode` against the SDK version and report both as evidence. The format is
confirmed by a real Xcode 26 build in `real-builds.yml`: `DTXcode` `2660`, `DTXcodeBuild` `17F113`,
`DTSDKName` `iphoneos26.5`.

## Mach-O executable (`CFBundleExecutable`)

Thin (`MH_MAGIC_64` `0xfeedfacf`) or fat (`FAT_MAGIC` `0xcafebabe` / `FAT_MAGIC_64` `0xcafebabf`,
fat headers are big-endian) — analyse the `arm64` slice, falling back to the first slice. See
`reference.md` for load-command layout.

Collect imported symbol names from **three** places and union them:

- `LC_SYMTAB` undefined external symbols
- `LC_DYLD_CHAINED_FIXUPS` imports table
- legacy `LC_DYLD_INFO(_ONLY)` bind opcodes

Collect Objective-C selector names from `__TEXT,__objc_methname` — only when the binary isn't
encrypted.

## Required-reason API detection

Map collected symbols/selectors to categories using `rules/apple-required-reason-apis.json`
(seeded from the brief's Appendix A; the `rules-auditor` agent must verify it against Apple's docs
before v1.0). Report the matched symbols as evidence on the finding.

## Privacy manifest validation

Keys: `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`,
`NSPrivacyAccessedAPITypes` (array of `{ NSPrivacyAccessedAPIType, NSPrivacyAccessedAPITypeReasons }`
dicts). An unknown category or reason code is `IOS-PRIV-003`, not a missing-manifest finding.

## Listed third-party SDKs

Match framework names (and common repackaged names) against `rules/apple-listed-sdks.json`
(Appendix B) → `IOS-PRIV-004` if that framework has no `PrivacyInfo.xcprivacy` of its own.

## Sources

- <https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api>
- <https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>
- <https://developer.apple.com/support/third-party-SDK-requirements/>
- <https://developer.apple.com/news/upcoming-requirements/>
