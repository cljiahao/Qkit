# hooks

## Purpose

Shell scripts invoked by Claude Code's hook events, referenced from `.claude/settings.json`.

## Contents

- `verify.sh` — a standalone verification-gate script: `set -e` then runs `pnpm build`, `pnpm check`, `pnpm test` in sequence, printing "Running verification gate..." and "All checks passed." It is not wired into any hook event in `settings.json` (which runs its own inline `tsc`/`pnpm test` commands instead) — it's meant to be invoked manually or by an agent after a substantial change, per its header comment "run after substantial changes."

## Connectivity

Nothing in `.claude/settings.json` currently calls `verify.sh` directly — the `PostToolUse` and `Stop` hooks there run their own equivalent `tsc`/`pnpm test` commands inline via `node -e`. `verify.sh` duplicates a stricter superset of that (adds `pnpm build`) for manual/on-demand use, e.g. from `AGENTS.md`'s guidance or before a release.

## Parent

[.claude](../README.md)
