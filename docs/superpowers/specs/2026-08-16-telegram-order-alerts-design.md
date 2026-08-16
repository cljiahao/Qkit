# Telegram Order Alerts — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

Phase A of `Merqo Business/docs/business/2026-08-16-telegram-integration-
design.md` — a vendor connects Telegram once, then gets a message the
moment a new order lands, as a redundant channel alongside the dashboard's
live order board (catches orders even when the vendor isn't looking at
the tablet). Named but never built in
`2026-07-17-vendor-expansion-and-integrations-strategy.md`.

**Distinct from, but designed to share infrastructure with,
`2026-07-18-vendor-notification-channels-design.md`** — that doc is the
_customer_-facing "your order is ready" ping (still a draft, its own open
questions unresolved), triggered from `advanceOrder`. This spec is the
_vendor_-facing "a new order arrived" alert, triggered from `placeOrder`.
Same bot, same webhook route, same deep-link mechanism — different linking
flow (a vendor links once, persistently; a customer would link per-order).
Building this phase first because it has no open questions blocking it —
the customer-facing doc's WhatsApp questions don't apply here.

## Guiding decisions

- **One bot for qkit**, own webhook route, own bot token — not shared with
  loopkit's own bot. Matches the cross-kit design doc's own "one bot per
  kit" decision.
- **Deep-link account linking**, Telegram's own standard pattern —
  `https://t.me/<BotName>?start=<token>`, a short-lived single-use token
  server generates, the bot's `/start` handler resolves.
- **Fire-and-forget from the existing `placeOrder` server action**, not
  from inside `qkit.place_order` itself — Postgres has no simple outbound-
  HTTP path here, and the action already runs in application code right
  after the RPC call succeeds. A failed Telegram send must never fail the
  order — the dashboard board is still the source of truth, this is a
  redundant channel, not a replacement.
- **Webhook signature verification is non-negotiable** — Telegram's
  `X-Telegram-Bot-Api-Secret-Token` header, checked against a secret
  configured on `setWebhook`. Without it, anyone who discovers the webhook
  URL could POST fake updates.

## What changes

### `supabase/migrations/0076_vendor_telegram.sql` (new)

```sql
create table qkit.vendor_telegram (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  chat_id    bigint not null,
  linked_at  timestamptz not null default now()
);

alter table qkit.vendor_telegram enable row level security;

create policy vendor_telegram_own on qkit.vendor_telegram
  for select using (vendor_id = (select auth.uid()));

grant select on qkit.vendor_telegram to authenticated;
-- Writes only via the service-role client (the webhook route + the
-- linking-token issuer action) — no INSERT/UPDATE/DELETE grant to
-- authenticated, matching vendor_payment_config's own writer-restriction
-- reasoning in the sibling paykit repo.

create table qkit.telegram_link_tokens (
  token       text primary key,
  vendor_id   uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

alter table qkit.telegram_link_tokens enable row level security;
-- RLS enabled, zero policies — service-role only, same "no client reads
-- this table at all" shape as qkit.pricing's writer restriction.
```

### `src/lib/telegram.ts` (new)

```ts
const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // Telegram alerts are optional infra, never a hard dependency.
  await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((err) => console.error("sendTelegramMessage failed", err));
}

export function generateLinkToken(): string {
  // A-Z a-z 0-9 _ - only, <=64 chars — Telegram's own deep-link payload
  // constraint, not a design choice.
  return crypto.randomUUID().replace(/-/g, "");
}
```

### `src/app/api/telegram/webhook/route.ts` (new)

`POST` handler:

1. Verify `X-Telegram-Bot-Api-Secret-Token` header against
   `process.env.TELEGRAM_WEBHOOK_SECRET`; 401 on mismatch.
2. Parse the Telegram `Update`. If it's a `message` with `text` starting
   `/start `, extract the token, look it up in
   `qkit.telegram_link_tokens` (service-role client), reject if
   missing/expired, else upsert `qkit.vendor_telegram` with the message's
   `chat.id`, delete the token, reply with a confirmation `sendMessage`.
3. Always `200` back to Telegram quickly (Telegram retries on non-2xx) —
   errors are logged, not surfaced to the Telegram side.
4. Excluded from `src/proxy.ts`'s auth gate — Telegram has no session
   cookie to send.

### `src/app/dashboard/settings` (or wherever vendor settings already live — check the actual route)

New "Connect Telegram" section: a server action generates a link token
(30-minute expiry), renders the deep-link as a QR code (this repo already
has a QR-rendering pattern for booth QR posters — reuse it, don't add a
second QR library) plus a plain tappable link for mobile. Shows "Connected"
once `qkit.vendor_telegram` has a row for the vendor, with a disconnect
action (deletes the row).

### `src/app/o/[code]/actions.ts`

After `placeOrder`'s existing successful-RPC branch, look up the booth's
`vendor_id`'s `qkit.vendor_telegram` row (service-role read); if found,
fire `sendTelegramMessage(chatId, ...)` with the order number and total —
awaited but its failure never affects the returned order-placement result
(wrap in try/catch, log, continue).

## Testing

- `src/lib/telegram.test.ts`: `sendTelegramMessage` calls the right URL/
  body; a missing `TELEGRAM_BOT_TOKEN` no-ops instead of throwing; a fetch
  failure is caught, not propagated.
- `src/app/api/telegram/webhook/route.test.ts`: rejects a request with a
  missing/wrong secret-token header (401); a valid `/start <token>`
  request with a valid unexpired token upserts `vendor_telegram` and
  deletes the token; an expired/unknown token is rejected without writing
  anything.
- `src/app/o/[code]/actions.place-order.test.ts` (extend): a booth whose
  vendor has a linked `chat_id` triggers `sendTelegramMessage`; a booth
  whose vendor doesn't skips it silently; a `sendTelegramMessage` failure
  doesn't change `placeOrder`'s own success response.
- New dashboard settings component test: renders the QR/link when
  disconnected, "Connected" state when a row exists, disconnect flow.

## Self-review

- No placeholders — every file has real, complete logic.
- Scope: Phase A only, no Mini App, no customer-facing flow, no
  `merqo.customers` change — those stay Phases B/C/D, not started here.
- A failed Telegram send can never break order placement — explicitly
  tested, not just claimed.

## Parent

[specs](README.md)
