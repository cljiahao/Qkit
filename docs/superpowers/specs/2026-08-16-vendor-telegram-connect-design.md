# Vendor Telegram Connect (Phase A2) — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

qkit's half of `Merqo Business/docs/business/2026-08-16-telegram-
integration-design.md`'s Phase A2 — retires qkit's own Telegram bot
(shipped in `2026-08-16-telegram-order-alerts-design.md`, Phase A) in
favor of merqo's shared one. **Read the master doc's "Phase A2" section
first** — the reason this supersedes Phase A (a vendor shouldn't hold two
unrelated "talking to Merqo" bot connections once merqo has its own) is
decided there, not re-derived here.

Depends on merqo's own spec
(`../../../merqo/docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`)
shipping first — `POST /api/merqo/vendor-connect-token` and
`POST /api/merqo/notify-vendor` must exist before this can call them.

## Guiding decisions

- **This is a retirement, not an addition.** Delete `qkit.vendor_telegram`,
  `qkit.telegram_link_tokens`, `src/app/api/telegram/webhook/`,
  `src/lib/telegram.ts`, the dashboard's "Connect Telegram" settings
  section (`telegram-section.tsx`/`telegram-actions.ts`), and
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` — none of it is needed
  once qkit calls merqo instead of running its own bot.
- **No data carries over.** A vendor's qkit-bot `chat_id` is meaningless
  under merqo's bot (Telegram scopes `chat_id` per bot×user pair). Every
  vendor who linked qkit's own bot loses that link the moment this ships
  and must reconnect via merqo's profile page — stated plainly, not
  glossed over (the master doc already names this; repeated here since
  it's this repo's own users affected).
- **`notifyVendorTelegram` keeps its name and call site** (`placeOrder`,
  `src/app/o/[code]/actions.ts`) — only its internals change, from a
  local `vendor_telegram` lookup + local `sendTelegramMessage` to a call
  to merqo's `notify-vendor` endpoint. Same fire-and-forget,
  never-blocks-`placeOrder`'s-own-result rule as before.

## What changes

### `supabase/migrations/00XX_drop_vendor_telegram.sql` (new — next free id)

```sql
drop table qkit.telegram_link_tokens;
drop table qkit.vendor_telegram;
```

### `src/app/o/[code]/actions.ts`

`notifyVendorTelegram(boothId, orderNumber)`: replace its body — still
looks up the booth's `vendor_id` (unchanged, still needed), then instead
of a local `vendor_telegram`/`sendTelegramMessage` call, calls
`notifyVendor(vendorId, message)` from the new
`src/lib/merqo-customer-notify.ts` (or a new sibling module —
implementer's call whether to add a `notifyVendor` export there or a
separate small file; either way, same HTTP-client shape as the existing
`mintCustomerConnectToken`/`notifyCustomer` functions, calling merqo's
`notify-vendor` instead). Still wrapped so a failure never affects
`placeOrder`'s own result.

### Deleted entirely

- `src/app/api/telegram/webhook/` (route + test)
- `src/lib/telegram.ts` (+ test)
- `src/app/dashboard/settings/telegram-section.tsx` (+ test),
  `telegram-actions.ts` (+ test)
- The "Connect Telegram" section's render call in
  `src/app/dashboard/settings/` (wherever it's composed into the page)
- `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` from `.env.example`

### New

`src/lib/merqo-customer-notify.ts` (extend, or a new
`src/lib/merqo-vendor-notify.ts` — implementer's call): add
`notifyVendor(vendorId: string, message: string): Promise<void>`, same
fail-closed/never-throw shape as `notifyCustomer`, posting to merqo's
`POST /api/merqo/notify-vendor`.

## Testing

- Extend `src/lib/merqo-customer-notify.test.ts` (or the new file's own
  test): `notifyVendor` posts the right body/headers, never throws.
- `src/app/o/[code]/actions.place-order.test.ts` (extend/rewrite the
  existing Telegram-alert block): `placeOrder` calls `notifyVendor` with
  the booth's `vendor_id`; a `notifyVendor` failure doesn't change
  `placeOrder`'s own result — replaces (not adds alongside) the old
  local-bot assertions, since that code path no longer exists.
- Delete the deleted files' own test files along with them — no orphaned
  tests referencing removed modules.

## Self-review

- No placeholders.
- This is explicitly a deletion-heavy spec — self-review must confirm
  every Phase A file this supersedes is actually removed, not left as
  dead code alongside the new path.
- The "no data carries over, vendors must reconnect" consequence is
  stated here too, matching the master doc.

## Parent

[specs](README.md)
