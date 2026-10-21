# Security Policy

Store Ready analyses app builds entirely on your device: the web app runs the analysis in a Web
Worker inside your browser, and the `storeready` CLI runs locally. Neither ever uploads your file
anywhere. See [docs/PRIVACY.md](docs/PRIVACY.md) for how that's enforced and tested.

## Supported versions

Only the latest released version is supported. Since this is a static web app and a CLI binary
with no server component, there is no "old version still running in production" to patch.

## Reporting a vulnerability

Please open a [GitHub issue](https://github.com/umerasiflhe/store-ready-checker/issues) describing
the problem and steps to reproduce. Avoid including a real app's `.ipa`/`.aab`/`.apk` in the report;
attach the JSON report instead, or a synthetic fixture that reproduces the issue. We'll acknowledge
reports within a few days.
