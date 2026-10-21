# Third-party notices

Store Ready is MIT-licensed (see [LICENSE](LICENSE)). It also uses third-party code under its own
license terms, noted below.

## Vendored Apache License 2.0 sources

`proto/` vendors `.proto` schema files from the Android Open Source Project and Google's
`bundletool`, both licensed under the Apache License, Version 2.0
(<http://www.apache.org/licenses/LICENSE-2.0>). Their original license headers are preserved in
each vendored file. These arrive in Milestone 2 alongside the Android protobuf-manifest parser
(see [docs/adr/0006-protobuf-codegen.md](docs/adr/0006-protobuf-codegen.md)); this section will be
updated with the exact file list and upstream source commit/tag at that point.

## npm and Swift package dependencies

Every npm devDependency/dependency (see `package.json`) and Swift package dependency (see
`cli/Package.swift`) is used under its own published license (overwhelmingly MIT or Apache-2.0).
Run `npm ls` / inspect `cli/Package.resolved` for the current dependency set and their licenses.
