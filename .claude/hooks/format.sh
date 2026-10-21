#!/usr/bin/env bash
# PostToolUse(Edit|Write): format the touched file so Claude never leaves a commit for
# lefthook's own formatter to redo.
set -uo pipefail

input="$(cat)"
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.swift)
    swift format --in-place "$file_path" >/dev/null 2>&1 \
      || xcrun swift-format --in-place "$file_path" >/dev/null 2>&1 \
      || true
    ;;
  *.ts | *.tsx | *.mts | *.cts | *.js | *.mjs | *.cjs | *.json | *.md | *.yml | *.yaml | *.css | *.html)
    npx --no -- prettier --write "$file_path" >/dev/null 2>&1 || true
    ;;
  *) ;;
esac

exit 0
