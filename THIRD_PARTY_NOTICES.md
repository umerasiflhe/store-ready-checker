# Third-party notices

Store Ready is MIT-licensed (see [LICENSE](LICENSE)). It also uses third-party code under its own
license terms, noted below.

## Vendored Apache License 2.0 sources

`proto/` vendors `.proto` schema files from the Android Open Source Project and Google's
`bundletool`, both licensed under the Apache License, Version 2.0
(<http://www.apache.org/licenses/LICENSE-2.0>). See [proto/README.md](proto/README.md) for the
exact file list, upstream source URLs, commit hashes and retrieval dates (per
[docs/adr/0006-protobuf-codegen.md](docs/adr/0006-protobuf-codegen.md)):

- `proto/aapt2/Resources.proto`, `proto/aapt2/Configuration.proto` — Android Open Source Project,
  `frameworks/base/tools/aapt2/` (original Apache-2.0 header preserved).
- `proto/bundletool/config.proto` — Google's `bundletool`, `src/main/proto/config.proto` (no
  per-file header upstream; licensed Apache-2.0 under that repo's root `LICENSE`).

TypeScript generated from these schemas (`packages/core/src/gen/`, via `npm run proto:gen`) is
machine-generated and committed per ADR 0006; it is not itself vendored third-party source.

## npm and Swift package dependencies

Every npm devDependency/dependency (see `package.json`) and Swift package dependency (see
`cli/Package.swift`) is used under its own published license (overwhelmingly MIT or Apache-2.0).
Run `npm ls` / inspect `cli/Package.resolved` for the current dependency set and their licenses.
