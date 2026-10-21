#!/usr/bin/env bash
# PreToolUse(Bash): block any command that would skip the mandatory git hooks (hard constraint 10).
set -uo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if [[ -z "$command" ]]; then
  exit 0
fi

block=false

echo "$command" | grep -qE -- '--no-verify' && block=true
echo "$command" | grep -qE -- 'LEFTHOOK=(0|false)([[:space:]]|$)' && block=true
echo "$command" | grep -qE -- 'core\.hooksPath' && block=true

has_git_commit=false
echo "$command" | grep -qE 'git[[:space:]]+commit([[:space:]]|$)' && has_git_commit=true
has_bare_n_flag=false
echo "$command" | grep -qE '(^|[[:space:]])-n([[:space:]]|$)' && has_bare_n_flag=true
if [[ "$has_git_commit" == true && "$has_bare_n_flag" == true ]]; then
  block=true
fi

if [[ "$block" == true ]]; then
  echo "Git hooks are mandatory (hard constraint 10). Fix the failure instead." >&2
  exit 2
fi

exit 0
