# next-verify

## Purpose

Skill that runs typecheck + lint + test in one pass for this project.

## Contents

- `SKILL.md` — defines the `next-verify` skill (`allowed-tools: Bash(pnpm *)`). Runs `pnpm check && pnpm test` and reports the result, where `pnpm check` = `prettier --check` + `eslint` + `tsc --noEmit`, and `pnpm test` = `vitest run`. Explicitly instructs: on failure, surface the failing output so it's fixed at the root — never skip, `.skip`, or disable a check/test to force green. Notes that the harness's own `PostToolUse` hook already runs incremental `tsc` per-edit and the `Stop` hook already runs `pnpm test`, so this skill's unique value is the lint + format gate (which no hook covers) plus one full-suite pass on demand.

## Connectivity

Scoped to `Bash(pnpm *)` only. Complements, rather than duplicates, the always-on hooks in `.claude/settings.json` — invoked as `/next-verify` before a commit/PR when a full check (including lint/format, which the hooks skip) is wanted.

## Parent

[skills](../README.md)
