#!/usr/bin/env bash
# PreToolUse(Bash) — block hook-bypass and destructive git/shell commands. Exit 2 = block.
input=$(cat)
cmd=$(printf '%s' "$input" | node -e "let b='';process.stdin.on('data',c=>b+=c);process.stdin.on('end',()=>{try{process.stdout.write(((JSON.parse(b||'{}').tool_input)||{}).command||'')}catch(e){process.stdout.write('')}})" 2>/dev/null)
[ -z "$cmd" ] && exit 0
scan=$(printf '%s' "$cmd" | sed "s/'[^']*'//g; s/\"[^\"]*\"//g")

if echo "$scan" | grep -qE 'git[[:space:]]+commit' && echo "$scan" | grep -qE '\-\-no-verify|[[:space:]]-[a-zA-Z]*n'; then
  echo "BLOCKED: --no-verify (or -n) on git commit bypasses the pre-commit hooks. Fix the failure instead." >&2
  exit 2
fi
if echo "$scan" | grep -qE '\bgit\b' && echo "$scan" | grep -qE '\bcommit\b' && echo "$scan" | grep -qE '(^|[[:space:]])LEFTHOOK(_EXCLUDE)?=|core\.hooksPath[[:space:]]*='; then
  echo "BLOCKED: LEFTHOOK=0 / LEFTHOOK_EXCLUDE / 'git -c core.hooksPath=...' disables the pre-commit hook layer — the same bypass as --no-verify. Fix the failure instead." >&2
  exit 2
fi
if echo "$cmd" | grep -qE 'git[[:space:]]+commit'; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ "$branch" == "main" ]]; then
    echo "BLOCKED: direct commit to protected branch '$branch'. Create a feature branch first." >&2
    exit 2
  fi
fi
if echo "$cmd" | grep -qE 'git[[:space:]]+push' && { { echo "$cmd" | grep -qE '\-\-force([[:space:]=]|$)|[[:space:]]-[a-z]*f' && echo "$cmd" | grep -qE '\bmain\b'; } || echo "$cmd" | grep -qE '[[:space:]]\+(main)\b'; }; then
  echo "BLOCKED: force-push to a protected branch (--force/-f or +refspec). Open a PR instead." >&2
  exit 2
fi
if echo "$cmd" | grep -qE 'git[[:space:]]+(checkout|restore)\b' && echo "$cmd" | grep -qE '(^|[[:space:]])(\.claude/|\.lefthook/|\.github/|lefthook\.yml|\.gitleaks\.toml|AGENTS\.md|CLAUDE\.md|docs/CONSTITUTION\.md)'; then
  echo "BLOCKED: 'git checkout/restore' on a guard-layer file discards enforcement config (this is how settings.json gets silently wiped). Confirm with a human first." >&2
  exit 2
fi
if echo "$cmd" | grep -qE '(^|[[:space:]])rm([[:space:]]|$)' && echo "$cmd" | grep -qE '[[:space:]]-[a-zA-Z]*r|[[:space:]]--recursive' && echo "$cmd" | grep -qE '[[:space:]]-[a-zA-Z]*f|[[:space:]]--force' && echo "$cmd" | grep -qE '(^|[[:space:]/"])(src|app|lib|test|\.claude|\.lefthook|\.git|node_modules)([[:space:]/"]|$)'; then
  echo "BLOCKED: recursive rm on a source directory. Confirm with a human first." >&2
  exit 2
fi
exit 0
