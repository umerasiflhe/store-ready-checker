# 6. Vendor and codegen the AAB/bundletool protobuf schemas

## Status

Accepted

## Context

AAB manifests are protobuf-encoded (`aapt.pb.XmlNode`), and `BundleConfig.pb` is bundletool's own
protobuf format. Both TypeScript and Swift need to decode these without hand-writing a protobuf
parser twice, and without guessing at field numbers that could silently drift from upstream.

## Decision

Vendor the `.proto` files from AOSP (`frameworks/base/tools/aapt2/Resources.proto`,
`Configuration.proto`) and bundletool (`config.proto`) under `proto/`, keeping their Apache-2.0
headers and listing them in `THIRD_PARTY_NOTICES.md`. Generate TypeScript with `@bufbuild/protobuf`
and `buf` into `packages/core/src/gen/`, and Swift with `swift-protobuf` into
`cli/Sources/StoreReadyCore/Generated/`. Both generated trees are committed (so CI and contributors
don't need `buf`/`protoc` installed to build) and marked `linguist-generated=true`; neither is
edited by hand — a drift check in the `web` CI job fails if regenerating produces a diff.

## Consequences

- Field access stays keyed to the vendored schema rather than reverse-engineered byte offsets,
  which is safer if AOSP/bundletool renumber or add fields.
- The repo takes on a small amount of generated-code weight, offset by `linguist-generated=true`
  keeping it out of GitHub diffs.
- Updating the vendored `.proto` files (if AOSP/bundletool change them) means regenerating both
  language outputs together — a mismatch here would show up immediately as a conformance failure.
