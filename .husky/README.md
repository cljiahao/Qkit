# .husky

## Purpose

The git-hook layer (husky v9 — no native binary, so nothing for Windows
Smart App Control to block, unlike lefthook's unsigned `lefthook.exe`).
`pnpm install`'s `prepare` script runs `husky`, which points
`core.hooksPath` at this directory.

## Contents

- `pre-commit` — runs format/lint (`prettier`+`eslint --fix` on staged
  `.ts/.tsx/.js/.mjs/.cjs`), format-docs (`prettier --write` on staged
  `.json/.md/.css`), `tsc --noEmit`, a frozen-lockfile install check when
  `package.json` is staged, a gitleaks secret-scan on staged files (if
  gitleaks is installed), then the README-coupling nudge.
- `commit-msg` — delegates to `lib/commit-msg-check.sh` with husky's
  message-file path (`$1`).
- `pre-push` — runs `.claude/verify-harness.sh` (integrity check) plus
  `pnpm run check && pnpm test`.
- `lib/` — script bodies the hooks above delegate to:
  - `readme-coupling.sh` — pre-commit nudge (non-blocking): warns to stderr
    when staged files touch a folder whose `README.md` wasn't also staged;
    the commit still proceeds.
  - `commit-msg-check.sh` — Conventional Commits gate: validates the commit
    message's first line against
    `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`,
    exempting merge commits and `chore(release):`; non-zero exit rejects the
    commit.

## Connectivity

Husky invokes `pre-commit`/`commit-msg`/`pre-push` directly by name — no
central config file (unlike lefthook's `lefthook.yml`). `commit-msg` passes
husky's message-file path straight through as `$1`, a plain argv element;
this is why the Windows-path-with-space argv-rejoin wrapper
`.lefthook/commit-msg/commit-msg.sh` used to need (lefthook's `{1}` template
substitution mis-quoted when the checkout path itself contains a space,
as this repo's does — "Merqo Business") is gone, not ported. `pre-push`
separately runs `.claude/verify-harness.sh` and the full
`pnpm run check && pnpm test` gate. `.claude/verify-harness.sh` treats every
file in this folder as part of the integrity-checked enforcement layer
recorded in `.claude/harness.json`.

## Parent

[qkit](../README.md)
