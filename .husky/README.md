# .husky

## Purpose

The git-hook layer (husky v9 — no native binary, so nothing for Windows
Smart App Control to block, unlike lefthook's unsigned `lefthook.exe`).
`pnpm install`'s `prepare` script runs `husky`, which points
`core.hooksPath` at `.husky/_` (husky-internal shims that `cd` up and exec
the real hook file below).

## Contents

- `pre-commit` — thin wrapper: `exec bash .husky/lib/pre-commit.sh "$@"`.
- `commit-msg` — thin wrapper: `exec bash .husky/lib/commit-msg-check.sh "$1"`.
- `pre-push` — thin wrapper: `exec bash .husky/lib/pre-push.sh "$@"`.
- `lib/` — the actual hook logic, as plain `bash` scripts with
  `#!/usr/bin/env bash` + `set -euo pipefail`:
  - `pre-commit.sh` — runs format/lint (`prettier`+`eslint --fix` on staged
    `.ts/.tsx/.js/.mjs/.cjs`), format-docs (`prettier --write` on staged
    `.json/.md/.css`), `tsc --noEmit`, a frozen-lockfile install check when
    `package.json` is staged, a gitleaks secret-scan on staged files (if
    gitleaks is installed), then the README-coupling nudge and the comment-
    hygiene nudge. Every `xargs` call uses `-d '\n'` so a staged filename
    with a space, quote, or apostrophe doesn't get word-split into multiple
    (wrong) arguments.
  - `pre-push.sh` — runs `.claude/verify-harness.sh` (integrity check) plus
    `pnpm run check && pnpm test`.
  - `readme-coupling.sh` — pre-commit nudge (non-blocking): warns to stderr
    when staged files touch a folder whose `README.md` wasn't also staged;
    the commit still proceeds.
  - `comment-hygiene.sh` — pre-commit nudge (non-blocking): scans staged
    `.ts/.tsx/.js/.jsx/.mjs/.cjs` files for change-narration comments and
    oversized (`>5`-line) comment blocks against
    `../../.claude/comment-hygiene-patterns.txt`; warns to stderr, the
    commit still proceeds. Same pattern source as
    `.claude/hooks/post-edit-comment-check.sh` and the `comment-hygiene` CI
    job, which hard-fails on added lines instead of warning.
  - `commit-msg-check.sh` — Conventional Commits gate: validates the commit
    message's first line against
    `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`,
    exempting merge commits and `chore(release):`; non-zero exit rejects the
    commit.

## Connectivity

Husky invokes `pre-commit`/`commit-msg`/`pre-push` directly by name — no
central config file (unlike lefthook's `lefthook.yml`) — but it does so via
its own internal dispatcher (`.husky/_/<hook>`, auto-generated, gitignored),
which runs each hook file with `sh -e "$s"`, **not** whatever the file's own
shebang says. On this Windows checkout `sh` resolves to Git Bash's
bash-compatible `sh`, so a `#!/usr/bin/env bash` + `set -euo pipefail` file
at `.husky/pre-commit` would still happen to work — but would break on a
real POSIX `sh` (e.g. dash on Debian/Ubuntu CI), where `pipefail` isn't
supported. That's why `pre-commit`/`commit-msg`/`pre-push` are all now thin
`exec bash .husky/lib/<name>.sh "$@"` one-liners (portable under any `sh`,
since `exec bash ...` just hands off to a real bash) and the actual
`set -euo pipefail` logic lives in `lib/`, which is only ever invoked via
`bash`, never sourced by the POSIX dispatcher directly. `commit-msg` passes
husky's message-file path straight through as `$1`, a plain argv element;
this is why the Windows-path-with-space argv-rejoin wrapper
`.lefthook/commit-msg/commit-msg.sh` used to need (lefthook's `{1}` template
substitution mis-quoted when the checkout path itself contains a space,
as this repo's does — "Merqo Business") is gone, not ported. `.claude/verify-harness.sh`
treats every file in this folder as part of the integrity-checked
enforcement layer recorded in `.claude/harness.json`.

## Parent

[qkit](../README.md)
