# 2. Read zip central directories, never the whole archive

## Status

Accepted

## Context

`.ipa`/`.aab`/`.apk` inputs can be 1–2 GB. Loading an entire file into memory (or into a single
`ArrayBuffer`) in a browser tab is slow, can exhaust tab memory on lower-end devices, and is
unnecessary — the checks only need specific entries (manifests, one executable per bundle, native
libraries).

## Decision

Read the zip **central directory** first (`@zip.js/zip.js` with `BlobReader`, or a hand-rolled
reader over `Blob.slice`), to get every entry's name, size, and offset without decompressing
anything. Then extract and stream-decompress only the entries each check actually needs
(`DecompressionStream('deflate-raw')` for deflated entries; stored entries are read directly).
Expose each entry's local-header data offset, since `AND-16K-003` needs it for zip-alignment
checks — the central directory's offset and the local header's offset can differ if their extra
fields differ in length.

## Consequences

- Handles ZIP64 (needed for large IPAs) and data descriptors as first-class cases, not
  afterthoughts.
- The Swift CLI (`ZIPFoundation`) must expose the same local-header-offset detail so both
  implementations can satisfy `AND-16K-003` identically (conformance tests catch drift).
- Symbol scanning is skipped (with an info finding) for executables above a configurable size cap
  (default 600 MB) rather than risking a frozen tab.
