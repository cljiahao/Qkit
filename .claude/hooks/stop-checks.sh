#!/usr/bin/env bash
# Stop — run the test suite; exit 2 (stderr to Claude) forces a fix before the turn ends.
input=$(cat)
active=$(printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(b||'{}').stop_hook_active||false))}catch(e){process.stdout.write('false')}})" 2>/dev/null)
[ "$active" = "true" ] || [ "$active" = "True" ] && exit 0
command -v pnpm >/dev/null 2>&1 || { echo "pnpm unavailable — skipping Stop gate" >&2; exit 0; }
OUTPUT=$(pnpm test 2>&1); EC=$?
echo "$OUTPUT" | tail -20 >&2
[ $EC -ne 0 ] && exit 2 || exit 0
