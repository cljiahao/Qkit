#!/usr/bin/env bash
# README-coupling nudge. Invoked by husky's pre-commit hook.
tmp=$(mktemp)
git diff --cached --name-only > "$tmp"
missing=""
while IFS= read -r f; do
  case "$f" in */README.md|README.md) continue ;; esac
  case "$f" in .claude/.harness-base/*) continue ;; esac
  d=$(dirname "$f")
  [ -d "$d" ] || continue
  rm_path="README.md"
  [ "$d" != "." ] && rm_path="$d/README.md"
  grep -qxF "$rm_path" "$tmp" || missing="$missing\n  - $d/"
done < "$tmp"
rm -f "$tmp"
missing=$(printf '%b' "$missing" | sort -u)
if [ -n "$missing" ]; then
  echo "⚠ folders changed without staging their README.md (commit still proceeds):"
  printf '%s\n' "$missing"
fi
exit 0
