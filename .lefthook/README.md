# .lefthook

## Purpose

Script bodies for the git-hook layer lefthook installs — commit-message
validation and a README-coupling nudge, kept as standalone files (rather
than inline `lefthook.yml` `run:` blocks) because lefthook's inline
multi-line command templating mis-quotes on native Windows, especially
when the checkout path itself contains a space (this repo's path contains
"Merqo Business").

## Contents

- `commit-msg/`
- `commit-msg.sh` — Conventional Commits gate: validates the commit message's first line against `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`, exempting merge commits and `chore(release):`; non-zero exit rejects the commit
- `readme-coupling.sh` — pre-commit nudge (non-blocking): warns to stderr when staged files touch a folder whose `README.md` wasn't also staged; the commit still proceeds

## Connectivity

`lefthook.yml` (repo root) is what actually invokes these — its `pre-commit`
block runs `readme-coupling.sh` directly, and its `commit-msg` block uses
lefthook's `scripts:` convention, which looks for
`.lefthook/<hook-name>/<script-name>`. That's why `commit-msg/commit-msg.sh`
exists as a subfolder file distinct from the top-level `commit-msg.sh`: it's
a thin entry point lefthook execs with the message-file path as a real
argv element (`$1`), working around the same Windows/space-in-path quoting
bug, and it immediately delegates to `../commit-msg.sh` — the canonical gate
script described above. `lefthook.yml`'s `pre-push` block separately runs
`.claude/verify-harness.sh` and the full `pnpm run check && pnpm test` gate,
neither of which lives in this folder.

## Parent

[qkit](../README.md)
