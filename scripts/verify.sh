#!/usr/bin/env bash
# What CI checks, runnable locally. `--full` adds the end-to-end suite and the
# git-hooks self-test (both slow; see docs/TESTING.md).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

full=false
for arg in "$@"; do
  case "$arg" in
    --full) full=true ;;
  esac
done

echo "==> Repo check"
npm run check:repo

echo "==> Lint"
npm run lint

echo "==> Typecheck"
npm run typecheck

echo "==> Unit tests + coverage gate"
npm run test:coverage

if [[ "$(uname -s)" == "Darwin" && -f cli/Package.swift ]]; then
  echo "==> Swift tests"
  npm run test:swift
else
  echo "==> Swift tests skipped (not on macOS, or cli/ not present yet)"
fi

echo "==> Conformance"
npx tsx scripts/conformance.ts

echo "==> Rules sync freshness"
npx tsx scripts/sync-rules.ts --check

echo "==> Rules doc freshness"
npx tsx scripts/gen-rules-doc.ts --check

echo "==> Web samples freshness"
npx tsx scripts/gen-web-samples.ts --check

echo "==> Build web app"
npm run build

echo "==> Size budget"
npm run size

if [[ "$full" == true ]]; then
  echo "==> Git hooks self-test"
  ./scripts/test-git-hooks.sh

  echo "==> End-to-end tests"
  npm run test:e2e
fi

echo "verify: all checks passed."
