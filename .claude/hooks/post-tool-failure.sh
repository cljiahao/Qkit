#!/usr/bin/env bash
# PostToolUseFailure — surface tool error context for self-correction. Always exit 0.
input=$(cat)
printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(b||'{}');process.stderr.write('Tool failure: '+(d.tool_name||'unknown')+(d.error?(' — '+d.error):'')+'\n')}catch(e){}})" 2>/dev/null
exit 0
