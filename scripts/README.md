# scripts

## Purpose

Standalone tooling scripts that aren't part of the Next.js app itself — the demo-video generator. (The README-freshness nudge formerly here as `check-readme-freshness.mjs` moved to `.husky/lib/readme-coupling.sh` as part of the lefthook→husky migration.)

## Contents

- `demo/` — the prospect-facing demo-video generator (Playwright recorder + ffmpeg compositor).

## Connectivity

`demo/` holds the only script suite in this folder today; see `scripts/demo/README.md`. The README-coupling nudge that used to live here now runs as a husky `pre-commit` command (`.husky/lib/readme-coupling.sh`).

## Parent

[qkit](../README.md)
