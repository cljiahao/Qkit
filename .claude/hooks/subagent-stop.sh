#!/usr/bin/env bash
# SubagentStop — type-gate a subagent's uncommitted TS changes so it can't hand back broken code.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
if git diff --name-only HEAD 2>/dev/null | grep -qE '\.(ts|tsx)$' || \
   git diff --cached --name-only 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  OUTPUT=$(pnpm exec tsc --noEmit 2>&1); EC=$?
  if [ $EC -ne 0 ]; then echo "$OUTPUT" | tail -20 >&2; exit 2; fi
fi
exit 0
