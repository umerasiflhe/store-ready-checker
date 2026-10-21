#!/usr/bin/env bash
# Proves the lefthook git hooks actually enforce what CONTRIBUTING.md claims (brief §7.8):
# a commit with a lint error, a failing test, or a non-conventional message is rejected,
# and a badly formatted file is auto-fixed and re-staged.
set -euo pipefail

export LEFTHOOK=1

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "==> Cloning repo into $tmp_dir"
git clone --local --quiet "$repo_root" "$tmp_dir"
ln -s "$repo_root/node_modules" "$tmp_dir/node_modules"

cd "$tmp_dir"
git config user.email "test-git-hooks@example.com"
git config user.name "test-git-hooks"
npx --no -- lefthook install

fail=0

echo "==> Expect: a commit with an ESLint error is rejected"
cat > packages/core/src/hook-test-lint.ts <<'EOF'
export const unused = (x: any) => {
  console.log(x);
};
EOF
git add packages/core/src/hook-test-lint.ts
if git commit -m "test: lint failure" --quiet >"$tmp_dir/attempt-lint.log" 2>&1; then
  echo "FAIL: commit with an ESLint error was accepted"
  fail=1
else
  echo "OK: commit with an ESLint error was rejected"
fi
git reset --hard --quiet HEAD
git clean -fd --quiet -e node_modules

echo "==> Expect: a commit that breaks a unit test is rejected"
cat > packages/core/src/hook-test-unit.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';

describe('hook test', () => {
  it('fails on purpose', () => {
    expect(true).toBe(false);
  });
});
EOF
git add packages/core/src/hook-test-unit.test.ts
if git commit -m "test: failing unit test" --quiet >"$tmp_dir/attempt-unit.log" 2>&1; then
  echo "FAIL: commit with a failing unit test was accepted"
  fail=1
else
  echo "OK: commit with a failing unit test was rejected"
fi
git reset --hard --quiet HEAD
git clean -fd --quiet -e node_modules

echo "==> Expect: a non-conventional commit message is rejected"
echo "<!-- hook test -->" >> README.md
git add README.md
if git commit -m "fixed stuff" --quiet >"$tmp_dir/attempt-msg.log" 2>&1; then
  echo "FAIL: non-conventional commit message was accepted"
  fail=1
else
  echo "OK: non-conventional commit message was rejected"
fi
git reset --hard --quiet HEAD

echo "==> Expect: a badly formatted file is fixed and re-staged"
cat > packages/core/src/hook-test-format.ts <<'EOF'
export const   badlyFormatted   =   (x:number)=>{return x+1}
EOF
git add packages/core/src/hook-test-format.ts
git commit -m "test: formatting fix" --quiet
committed_content="$(git show HEAD:packages/core/src/hook-test-format.ts)"
if echo "$committed_content" | grep -q "badlyFormatted   ="; then
  echo "FAIL: badly formatted file was not auto-fixed"
  fail=1
else
  echo "OK: badly formatted file was auto-fixed and re-staged"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "scripts/test-git-hooks.sh: one or more hook behaviors did not match expectations."
  exit 1
fi

echo "scripts/test-git-hooks.sh: all hook behaviors verified."
