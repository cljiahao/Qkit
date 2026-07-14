# Demo video generator

Produces a vertical (9:16) screen-capture of QKit for sending to a prospect:
**register → name your stall → add menu → QR → customer orders → order lands
live on the board (pure queue) → add PayNow → customer pays → vendor confirms
(payment queue)**. Shows both the unpaid (queue-only) and paid flows on one
booth — payment is the optional upgrade. Captions burned per beat, no audio.

> Runs against `DEMO_BASE_URL` (default `http://localhost:3000`). If port 3000
> is taken, start `pnpm dev` on another port and set `DEMO_BASE_URL` to match.
> The booth gains its payment method through the UI in the recording — no seed
> change needed.

Spec: [`docs/superpowers/specs/2026-06-24-demo-video-generator-design.md`](../../docs/superpowers/specs/2026-06-24-demo-video-generator-design.md).

> Status: **authored, not yet recorded** — needs Docker + local Supabase to run.
> Implemented as `.mjs` (plain ESM + Playwright's bundled `chromium`) so it runs
> with bare `node`, no extra tooling deps. `reset.sql` is plain SQL via `psql`.

## Files

| File          | Does                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `reset.sql`   | Wipes the fixed demo account so each run starts identical            |
| `record.mjs`  | Drives the real app (phone viewport), records `.webm` + `steps.json` |
| `compose.mjs` | ffmpeg: pad to 1080×1920 + burn captions → `demo.mp4`                |
| `out/`        | Generated artifacts (git-ignored)                                    |

## Prerequisites

1. **Docker Desktop running.**
2. Local Supabase up + schema applied:
   ```bash
   pnpm exec supabase start
   pnpm exec supabase db reset    # applies all migrations incl. 0022
   ```
   (No seed needed — the demo creates its own booth/menu through the UI.)
3. **`pnpm dev`** running (http://localhost:3000).
4. **ffmpeg** on PATH (already present in this environment).

## Run

```bash
# 1. Clean state (point at your LOCAL db url from `pnpm exec supabase status`)
psql "<LOCAL_DB_URL>" -f scripts/demo/reset.sql

# 2. Record (opens a headed phone-sized browser and drives the flow)
node scripts/demo/record.mjs

# 3. Compose the captioned vertical mp4
node scripts/demo/compose.mjs
#    → scripts/demo/out/demo.mp4
```

Re-run freely: step 1 makes step 2 idempotent.

## Tuning

- **Pacing / captions:** edit the `beat(...)` waits and the `step("caption", …)`
  labels in `record.mjs`. Caption _timing_ comes from `steps.json`, so you can
  also retune copy in `compose.mjs` without re-recording.
- **Identity / menu:** the `EMAIL` / `STALL` / `ITEMS` constants at the top of
  `record.mjs` (keep `EMAIL` in sync with `reset.sql`).
- **Captions blank?** ffmpeg can't find the font — set `DEMO_FONT` to a `.ttf`
  (e.g. `DEMO_FONT=/path/to/font.ttf node scripts/demo/compose.mjs`).
- **A beat times out?** The app markup moved — fix that beat's locator in
  `record.mjs` (selectors are pinned to login / onboarding / booth-form /
  menu-editor / order-form / order-card).

## Notes

- Records against **local** Supabase only — never prod.
- The live-pop beat uses a second, un-recorded browser context to place a walk-in
  order, so the ticket arrives on the board through the real realtime
  subscription (genuine, not faked).

## Structure

### Contents

- `assets/`
- `compose.mjs`
- `record.mjs`
- `reset.sql`

### Connectivity

`assets/` holds the optional royalty-free music bed `compose.mjs` mixes under
the recording. `record.mjs` drives the real app and writes the raw `.webm` +
`steps.json` (caption/timing per beat) into `out/`; `compose.mjs` reads those
two and renders the final captioned `demo.mp4` alongside them.

## Parent

[scripts](../README.md)
