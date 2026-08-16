# webhook

## Purpose

The single HTTPS endpoint registered with Telegram (`setWebhook`) for
qkit's bot — every `Update` Telegram sends lands here. Currently handles
only account linking (`/start <token>`); everything else is silently
ignored.

## Contents

- `route.ts` — `POST(request)`. Verifies `X-Telegram-Bot-Api-Secret-Token`
  against `TELEGRAM_WEBHOOK_SECRET` with a constant-time comparison
  (`timingSafeEqual`) before touching any data — `401` on a missing or
  wrong header, fails closed if the secret itself isn't configured. Parses
  the body as a Telegram `Update` (Zod, only the `message.text`/`chat.id`
  shape this route actually reads); a `/start <token>` message resolves the
  token against `qkit.telegram_link_tokens` (service-role — that table has
  no client-read policy at all), silently no-ops on a missing/expired
  token, otherwise upserts `qkit.vendor_telegram` with the message's
  `chat.id`, deletes the now-used token, and sends a confirmation message
  back. Always responds `200` to any Telegram-shaped payload regardless of
  internal outcome — Telegram retries aggressively on a non-2xx, so every
  internal failure is logged, never surfaced as a webhook error. A
  malformed (non-JSON) body also gets a `200` rather than a `400`, for the
  same reason.
- `route.test.ts` — mocks `@/lib/supabase/server`'s `createServiceClient`
  and `@/lib/telegram`'s `sendTelegramMessage`; covers the missing/wrong/
  unset-secret 401 paths, the happy-path link (upsert + token delete +
  confirmation send), expired-token and unknown-token no-ops, a non-`/start`
  message, an internal lookup throw, and a malformed JSON body — all still
  responding `200` except the three 401 cases.

## Connectivity

Reached only by Telegram's own servers, once registered via `setWebhook`
(`docs/DEPLOY.md`) — this repo never calls it itself.
`src/proxy.ts`'s auth-gate matcher only protects `/dashboard`,
`/onboarding`, and `/admin` (see `src/lib/supabase/middleware.ts`'s
`isProtectedPath`), so this route already passes through untouched; no
exclusion was needed. Writes `qkit.vendor_telegram` (read by
`src/app/o/[code]/actions.ts`'s `notifyVendorTelegram` on every order) and
consumes rows from `qkit.telegram_link_tokens` (written by
`src/app/dashboard/settings/telegram-actions.ts`'s `generateTelegramLink`).

## Parent

[telegram](../README.md)
