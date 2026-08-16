# telegram

## Purpose

The Telegram Bot API surface for qkit's vendor order alerts (Phase A of
`docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`): a
vendor links their Telegram once via a deep-link QR, then gets a message on
every new order as a redundant channel alongside the live dashboard board.

## Contents

- `webhook/` — the single registered webhook route Telegram POSTs every
  `Update` to; see its own README.

## Connectivity

`webhook/route.ts` is called by Telegram's own servers, not by anything
inside qkit — see `docs/DEPLOY.md` for the one-time `setWebhook`
registration step. The vendor-facing linking flow it resolves is triggered
from `src/app/dashboard/settings/telegram-actions.ts`; the resulting
`qkit.vendor_telegram` row is read by `src/app/o/[code]/actions.ts`'s
`notifyVendorTelegram` on every successful order.

## Parent

[api](../README.md)
