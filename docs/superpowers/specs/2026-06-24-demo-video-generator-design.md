# Demo video generator — design

**Date:** 2026-06-24
**Status:** approved (brainstorm), pending implementation plan

## Why

A real prospect (coffee-cart vendor met at a wedding, via Instagram DM) asked to
see "a short video of how it works." This produces that artifact: a short,
sendable screen-capture of qkit that answers her stated pains — crowding, orders
piling up, customers wandering off before their drink is ready.

The video is a **sales artifact for one human**, not a marketing reel or an
automated test. Quality bar: sendable to a prospect without embarrassment.

## Decisions (locked during brainstorm)

| Decision      | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Story / spine | Onboarding + ease of use — "live in one step, orders just run"  |
| Length        | Under 60 seconds                                                |
| Orientation   | Vertical 9:16, single continuous screen (watched in IG DM)      |
| Quality bar   | Automated capture **+ polish pass** (cursor, pacing, captions)  |
| Realtime beat | **Live pop** — order animates onto the board from a 2nd context |
| Tooling       | Playwright (already in repo) + ffmpeg (8.1, present)            |
| Environment   | Local Supabase (controllable, safe, no prod data)               |

Rejected: Puppeteer (Playwright already wired with the order flow + seed);
landscape/square (vertical fills a phone DM); raw capture (robotic for sales).

## Story beats (the recorded flow)

One continuously-recorded browser context follows a single narrative. A second,
**unrecorded** context exists only to fire the live order (beat 5).

| #   | Beat      | On screen                                                  | Caption                       |
| --- | --------- | ---------------------------------------------------------- | ----------------------------- |
| 1   | Onboard   | Type stall name → "Open my stall →" → board (Step 1 of 1)  | "Live in one step"            |
| 2   | Add booth | Create booth + 2–3 menu items → booth active               | "Add your menu"               |
| 3   | QR        | Booth QR page                                              | "Customers scan this"         |
| 4   | Customer  | Same context → `/order/[boothId]`, pick drink, place order | "They order from their phone" |
| 5   | Live pop  | Back on the board; background context fires an order →     | "You see every order live"    |
|     |           | ticket animates in; tap `preparing` → `ready`              |                               |

Onboarding is genuinely "Step 1 of 1" (`onboarding-form.tsx`) — that simplicity
is the message. Lead with it.

## Architecture

Three stages, one pipeline, isolated by file:

```
scripts/demo/
  reset.sql      — deterministic clean state (wipe the fixed demo vendor/booth/orders)
  record.ts      — Playwright: drive the real app at a phone viewport, record raw .webm,
                   emit steps.json (caption text + start/end ms per beat)
  steps.json     — produced by record.ts; consumed by compose
  compose.sh     — ffmpeg: .webm → crop/scale 9:16 → burn captions from steps.json
                   → optional music bed → demo.mp4
```

Each unit has one job and a file-level interface:

- **reset.sql** in → clean DB out. No knowledge of recording.
- **record.ts** in (clean app) → raw `.webm` + `steps.json` out. No knowledge of ffmpeg.
- **compose.sh** in (`.webm` + `steps.json` [+ music]) → `demo.mp4` out. No knowledge of Playwright.

Decoupling captions/music into `compose.sh` (driven by `steps.json` timestamps)
means caption copy/timing/music can be retuned without re-running the browser.

## Component detail

### record.ts (Playwright standalone script, not a `@playwright/test` spec)

Uses `chromium.launch()` + `browser.newContext({ recordVideo, viewport })` for
per-context control the test runner config doesn't give cleanly.

- **Viewport:** ~390×844, `deviceScaleFactor: 2` — already near 9:16, minimal crop.
- **Fake cursor:** `context.addInitScript` injects a fixed-position dot that
  tracks `mousemove`; the script drives `page.mouse.move(x, y, { steps })` so the
  cursor visibly glides to each target before `click()`. (Playwright's native
  click is invisible + instant — this is the single biggest anti-robotic fix.)
- **Pacing helpers:** `slowType(locator, text, perCharMs)`, `beat(ms)` waits
  between narrative steps, smooth-move-then-click wrapper.
- **Timeline:** wrap each beat in a helper that records `{ label, startMs, endMs }`
  relative to recording start, flushed to `steps.json` at the end.
- **Live pop (beat 5):** a second `browser.newContext()` (NOT recorded) places an
  order via the customer page (or a direct `placeOrder` call) while the recorded
  context sits on the board, so the ticket arrives through the real realtime
  subscription — genuine, not faked.

### compose.sh (ffmpeg)

- Crop/scale the raw `.webm` to 1080×1920.
- Burn captions: one `drawtext` per `steps.json` entry, gated by
  `enable='between(t,start,end)'`.
- Optional `-i music.mp3` mixed low; `-shortest`.
- Output H.264 `demo.mp4`.

### reset.sql

Wipe a **fixed** demo vendor + its booths + orders so every run starts identical
and `record.ts` can register/own a known account. Run via `psql` against local
Supabase before `record.ts`.

## Data flow

```
reset.sql ──▶ clean local Supabase
                   │
            record.ts (Playwright)
              ├─▶ raw .webm
              └─▶ steps.json
                   │
            compose.sh (ffmpeg) ──▶ demo.mp4
```

## Error handling

- **record.ts** fails loud on any locator timeout — a half-recorded video is
  useless, so no soft-failing. Each beat asserts its landing state (mirrors the
  existing `customer-order.spec.ts` assertion style) before proceeding.
- **compose.sh** checks `.webm` + `steps.json` exist before invoking ffmpeg.
- Re-runnable: `reset.sql` makes `record.ts` idempotent; safe to iterate.

## Open feasibility risks (verify first in the plan)

1. **Dashboard at phone width** — board is `grid-cols-1` on mobile (likely fine),
   but the onboarding/booth-create/QR screens need an eyeball at ~390px before
   committing to viewport size.
2. **Local signup without email confirmation** — if local Supabase requires email
   confirm, beat 1 can't register live. Fallback: pre-seed the vendor via service
   client / SQL and have `record.ts` log in instead of register. Confirm which.
3. **Booth-create + menu-item entry shape** — `dashboard/booths/new` not yet read;
   the plan must read it to script beat 2 accurately.

## Out of scope (YAGNI)

- No voiceover, no branded intro/outro card (can add later if she bites).
- No multi-booth, no stats/feedback screens — onboarding + one order only.
- Not wired into CI; this is an on-demand authoring tool under `scripts/demo/`.

## Testing

This is a tool that produces a one-off artifact, not shipped app code. Validation
is **watch the output**: does `demo.mp4` run <60s, read clearly at phone size,
captions land on the right beats, cursor looks human, live pop visibly arrives.
No automated test suite for the generator itself.
