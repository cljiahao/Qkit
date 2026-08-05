#!/usr/bin/env bash
# Comment-hygiene nudge. Invoked by husky's pre-commit hook. Warn-only (never
# blocks): flags change-narration comments and oversized comment blocks in
# staged files. Patterns come from .claude/comment-hygiene-patterns.txt.
patterns=".claude/comment-hygiene-patterns.txt"
[ -f "$patterns" ] || exit 0
nl=$(printf '\nx')
nl=${nl%x}
flagged=""
for f in $(git diff --cached --name-only); do
  case "$f" in *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs) ;; *) continue ;; esac
  [ -f "$f" ] || continue
  block_len=0
  prev_lineno=0
  candidates=$(mktemp)
  grep -nE '^[[:space:]]*(#|//|\*|/\*\*?)' "$f" >"$candidates" || true
  while IFS= read -r cline; do
    lineno="${cline%%:*}"
    content="${cline#*:}"
    if [ "$prev_lineno" -ne 0 ] && [ "$lineno" -ne $((prev_lineno + 1)) ]; then
      [ "$block_len" -gt 5 ] && flagged="$flagged$nl  - $f: oversized comment block ($block_len lines)"
      block_len=0
    fi
    stripped=$(printf '%s' "$content" | sed -E 's@^[[:space:]]*(#|//|\*|/\*\*?)[[:space:]]?@@')
    if [ -n "$stripped" ] && printf '%s' "$stripped" | grep -qEf "$patterns"; then
      flagged="$flagged$nl  - $f: $stripped"
    fi
    if printf '%s' "$content" | grep -qE '^[[:space:]]*//'; then
      block_len=$((block_len + 1))
    else
      [ "$block_len" -gt 5 ] && flagged="$flagged$nl  - $f: oversized comment block ($block_len lines)"
      block_len=0
    fi
    prev_lineno="$lineno"
  done <"$candidates"
  rm -f "$candidates"
  [ "$block_len" -gt 5 ] && flagged="$flagged$nl  - $f: oversized comment block ($block_len lines, end of file)"
done
if [ -n "$flagged" ]; then
  echo "⚠ comment hygiene (commit still proceeds):"
  printf '%s\n' "$flagged"
fi
exit 0
