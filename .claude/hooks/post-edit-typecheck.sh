#!/usr/bin/env bash
# PostToolUse(Edit|Write) — fast type feedback on TS edits only. Feedback-only (never blocks).
input=$(cat)
file=$(printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const ti=(JSON.parse(b||'{}').tool_input)||{};process.stdout.write(ti.file_path||ti.path||'')}catch(e){process.stdout.write('')}})" 2>/dev/null)
case "$file" in *.ts|*.tsx) ;; *) exit 0 ;; esac
pnpm exec tsc --version >/dev/null 2>&1 || exit 0
pnpm exec tsc --noEmit --incremental 2>&1 | tail -5
exit 0
