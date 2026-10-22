# Vendored protobuf schemas

Per [ADR 0006](../docs/adr/0006-protobuf-codegen.md), these `.proto` files are vendored verbatim
from upstream (Apache License 2.0) so field numbers never drift from AOSP/bundletool. Regenerate
TypeScript with `npm run proto:gen` after touching anything here; never hand-edit the generated
output in `packages/core/src/gen/`.

| File                        | Upstream                                                                                                                                                                    | Commit                                     | Retrieved  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| `aapt2/Resources.proto`     | [aosp-mirror/platform_frameworks_base:tools/aapt2/Resources.proto](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/tools/aapt2/Resources.proto)         | `1cdfff555f4a21f71ccc978290e2e212e2f8b168` | 2026-10-22 |
| `aapt2/Configuration.proto` | [aosp-mirror/platform_frameworks_base:tools/aapt2/Configuration.proto](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/tools/aapt2/Configuration.proto) | `1cdfff555f4a21f71ccc978290e2e212e2f8b168` | 2026-10-22 |
| `bundletool/config.proto`   | [google/bundletool:src/main/proto/config.proto](https://github.com/google/bundletool/blob/master/src/main/proto/config.proto)                                               | `586a43a450712a1067f3d92cf7574dee68226302` | 2026-10-22 |

Each file's original Apache-2.0 header (where upstream includes a per-file header) is preserved
unchanged. `bundletool/config.proto` carries no per-file header upstream — its repo is licensed
under Apache-2.0 via the root [`LICENSE`](https://github.com/google/bundletool/blob/master/LICENSE)
file, noted in `THIRD_PARTY_NOTICES.md`.

The only change from upstream content: `aapt2/Resources.proto`'s `import` path was rewritten from
the AOSP tree-relative `frameworks/base/tools/aapt2/Configuration.proto` to the vendored-layout
`aapt2/Configuration.proto`, since buf resolves imports relative to this directory, not the AOSP
source tree.
