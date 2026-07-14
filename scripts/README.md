# scripts

## Purpose

Standalone tooling scripts that aren't part of the Next.js app itself — build-time and git-hook helpers plus the demo-video generator.

## Contents

- `check-readme-freshness.mjs` — a non-blocking pre-commit reminder: diffs staged files (via `git diff --cached --name-only --diff-filter=ACMR`), groups changed source files (`.ts`/`.tsx`/`.mjs`/`.sql`/`.css`/`.json`, excluding `*.test.ts(x)`/`*.dom.test.tsx`) by directory, and for any directory with an existing `README.md` that wasn't itself staged in this commit, prints a "consider refreshing it" nudge. It never fails the commit — README prose can't be regenerated mechanically, so it only nags.
- `demo/` — the prospect-facing demo-video generator (Playwright recorder + ffmpeg compositor).

## Connectivity

`check-readme-freshness.mjs` is intended to run as (or from) a git pre-commit hook alongside husky/lint-staged. `demo/` holds the only script suite in this folder today; see `scripts/demo/README.md`.

## Parent

[qkit](../README.md)
