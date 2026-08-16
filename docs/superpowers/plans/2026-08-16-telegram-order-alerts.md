# Telegram Order Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor connects Telegram once (deep-link QR); every new order
fires a Telegram message to their linked chat, as a redundant channel
alongside the live dashboard board. Phase A only — no customer-facing
flow, no Mini App, no `merqo.customers` change.

**Spec:** `docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`

## Global Constraints

- A failed/missing Telegram link must never affect order placement itself
  — `placeOrder`'s own success/failure is independent of the Telegram
  send.
- Webhook signature verification (`X-Telegram-Bot-Api-Secret-Token`) is
  mandatory, not optional — reject unverified requests before touching
  any data.
- `qkit.vendor_telegram` and `qkit.telegram_link_tokens`: no client-side
  INSERT/UPDATE/DELETE grant — writes only via the service-role client
  (the webhook route and the link-token-issuing action).
- Reuse the existing QR-rendering utility (`qr-image.ts` /
  `booth-qr-poster.tsx`'s pattern) — do not add a second QR library.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/telegram-order-alerts origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: Migration

**Files:** `supabase/migrations/0076_vendor_telegram.sql`

- [ ] Write the migration exactly as in the spec's "What changes" section
      (`qkit.vendor_telegram`, `qkit.telegram_link_tokens`, RLS, grants).
- [ ] Apply locally (`/supabase-migrate` skill or `supabase db reset`).
- [ ] Commit: `feat: add vendor_telegram and telegram_link_tokens tables`.

### Task 2: `src/lib/telegram.ts`

**Files:** `src/lib/telegram.ts`, `src/lib/telegram.test.ts`

- [ ] Failing tests first: `sendTelegramMessage` calls
      `https://api.telegram.org/bot<token>/sendMessage` with the right
      JSON body; no-ops (doesn't throw) when `TELEGRAM_BOT_TOKEN` is
      unset; catches and logs a fetch rejection instead of propagating.
      `generateLinkToken()` returns a string matching
      `/^[A-Za-z0-9_-]{1,64}$/`.
- [ ] Implement per the spec.
- [ ] Commit: `feat: add sendTelegramMessage and generateLinkToken helpers`.

### Task 3: Webhook route

**Files:** `src/app/api/telegram/webhook/route.ts`,
`src/app/api/telegram/webhook/route.test.ts`

- [ ] Failing tests first: 401 on missing/wrong secret-token header; a
      valid `/start <token>` with a valid unexpired token upserts
      `vendor_telegram` (service-role) and deletes the token; an
      expired/unknown token responds without writing anything; always
      responds 200 to Telegram-shaped payloads even on an internal
      lookup miss (log, don't 500 — Telegram retries aggressively on
      non-2xx).
- [ ] Implement per the spec.
- [ ] Confirm this route is excluded from `src/proxy.ts`'s auth-gate
      matcher (Telegram sends no session cookie).
- [ ] Commit: `feat: add Telegram webhook route with signature verification`.

### Task 4: Dashboard settings section

**Files:** `src/app/dashboard/settings/` (extend existing page/actions),
new test file matching this route's existing test convention.

- [ ] Failing tests first: renders the deep-link QR + tappable link when
      disconnected; renders a "Connected" state + disconnect action when
      `vendor_telegram` has a row; disconnect deletes the row.
- [ ] Server action: generate a 30-minute-expiry token via
      `generateLinkToken()`, insert into `telegram_link_tokens`
      (service-role), return the deep-link URL
      (`https://t.me/<bot_username>?start=<token>`) for the QR component
      to render.
- [ ] Commit: `feat: add Connect Telegram section to dashboard settings`.

### Task 5: Wire the alert into `placeOrder`

**Files:** `src/app/o/[code]/actions.ts`,
`src/app/o/[code]/actions.place-order.test.ts` (extend)

- [ ] Failing tests first: a booth whose vendor has a linked `chat_id`
      triggers `sendTelegramMessage` with the order number/total after a
      successful `placeOrder`; a booth whose vendor has no link skips it
      silently; a `sendTelegramMessage` rejection doesn't change
      `placeOrder`'s own returned result.
- [ ] Implement: after the existing successful-RPC branch, service-role
      lookup of the booth's `vendor_id` in `vendor_telegram`; if found,
      `sendTelegramMessage(chat_id, ...)` wrapped in try/catch.
- [ ] Commit: `feat: send a Telegram alert on new orders when the vendor is linked`.

### Task 6: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `src/lib/README.md`,
`src/app/api/README.md` (or wherever API routes are documented),
`src/app/dashboard/settings/README.md`, `CHANGELOG.md`

- [ ] Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` to
      `.env.example` with a one-line comment on where to get each
      (BotFather for the token; a self-chosen random string for the
      webhook secret, configured via `setWebhook`'s `secret_token` param
      — this plan doesn't automate that one-time `setWebhook` call, note
      it as a manual deploy step in `AGENTS.md`/`docs/DEPLOY.md`).
- [ ] Update AGENTS.md's data model / file layout sections, `lib/README.md`,
      and add a `CHANGELOG.md` entry.

### Task 7: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`; `supabase test db` if RLS
      was touched (extend `supabase/tests/rls.test.sql` with
      `vendor_telegram`/`telegram_link_tokens` RLS coverage — public
      denied, own-row select works, no client write grant — same pattern
      as every other RLS test block in this file).
- [ ] Push, PR, poll CI green, squash-merge.

## Self-Review Notes

- Spec coverage: migration (Task 1), helpers (Task 2), webhook (Task 3),
  settings UI (Task 4), order-alert wiring (Task 5), docs/env (Task 6),
  verification (Task 7). Phases B/C/D correctly have no task.
- No task lets a Telegram failure affect order placement — Task 5's tests
  explicitly prove this, not just claim it.
- Migration note for whoever deploys this: the one-time `setWebhook` API
  call (registering the URL + secret token with Telegram) is a manual
  step, not part of the migration or app code — flagged in Task 6, not
  silently assumed.
