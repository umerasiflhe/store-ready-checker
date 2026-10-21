# Store Ready

Check an iOS or Android build against the current App Store Connect and Google Play upload rules before you upload it. It runs in your browser, and your file is never uploaded.

[![CI](https://github.com/umerasiflhe/store-ready-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/umerasiflhe/store-ready-checker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Status: in development.** The web checker will be live at <https://umerasiflhe.github.io/store-ready-checker/> after Milestone 5. Progress is in [CHANGELOG.md](CHANGELOG.md).
>
> **Works today:** repo scaffolding, tooling, git hooks and CI linting (Milestone 0).

## What it checks

<!-- rules:start -->
<!-- rules:end -->

Sources and dates for every rule: [docs/RULES.md](docs/RULES.md).

## Privacy

Your build is read by a Web Worker inside your browser and is never sent anywhere. A Content-Security-Policy blocks outgoing data, and an automated test proves it. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Develop

```bash
npm ci                # install dependencies and the git hooks
npm run dev           # web app at http://localhost:5173/store-ready-checker/
npm run lint          # every linter
npm test              # unit tests
./scripts/verify.sh   # what CI checks, quickly
```

Needs Node (version in `.nvmrc`), Xcode 26 for the Swift CLI, and `brew install actionlint shellcheck`. Every commit runs the linters and unit tests through git hooks; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

[Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing](docs/TESTING.md) · [CI/CD](docs/CI-CD.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

[MIT](LICENSE). Not affiliated with Apple or Google.
