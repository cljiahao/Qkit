#!/usr/bin/env bash
# PostToolUse(Skill__.*) — silent skill-usage logger. Feeds /skill-audit. Always exits 0.
input=$(cat)
name=$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"Skill__\([^"]*\)".*/\1/p' | head -1)
[ -z "$name" ] && exit 0
printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" >> .claude/skill-usage.log
exit 0
