# [code]

## Purpose

Customer menu + cart + checkout for a booth, keyed by its short QR code —
the current (non-legacy) customer ordering entry point.

## Contents

- `actions.ts` — `placeOrder(code, input, idempotencyKey)` server action:
  validates `code`/`idempotencyKey`/`input` (`placeOrderSchema`), applies a
  best-effort per-IP flood guard (`rateLimit`, 8/60s, fails open), normalizes
  a blank/whitespace-only `customerPhone` to `undefined` (so "left blank" and
  "never typed" are indistinguishable to the RPC), then calls the
  `place_order` RPC with `p_customer_phone`. Maps known Postgres `RAISE`
  prefixes (`ORDER_EXPIRED`/`ORDER_UNSERVABLE`/`ORDER_SOLD_OUT`/
  `ORDER_ITEM_UNAVAILABLE`/`ORDER_RATE_LIMITED`) to customer-facing messages
  via `messageFor()`, logs only the genuinely-unexpected failures, and on
  success fires the `order_placed` analytics event, fires
  `notifyVendorTelegram(boothId, orderNumber)` (a redundant vendor alert via
  merqo's shared Telegram bot), and returns
  `{ orderNumber, boothId, accessToken }`. `notifyVendorTelegram` is
  entirely best-effort and wrapped in its own try/catch: it resolves the
  booth's `vendor_id`, looks up the order's `total_cents` for the message
  text (both via the service-role client — no vendor session exists in this
  customer-facing action), then calls `@/lib/merqo-customer-notify`'s
  `notifyVendor(vendorId, message)` — a merqo outage or a vendor who never
  connected can never affect `placeOrder`'s own returned result. See
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`
  (Phase A2 — supersedes qkit's own retired bot, formerly
  `docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`).
- `actions.place-order.test.ts` — unit tests (RPC mocked) covering: the
  expired-code message mapping, a successful order, the action-level flood
  guard rejecting before `place_order` is ever called, fail-open behaviour
  when the limiter RPC itself errors, every known raise→message mapping via
  `it.each`, a malformed-RPC-output guard, rejection of a non-UUID
  idempotency key before any RPC call, a supplied `customerPhone` reaching
  `place_order` as `p_customer_phone`, and an omitted/blank/whitespace-only
  one instead sending `p_customer_phone: undefined` (cross-kit customer
  identity, migration `0075` — the "genuinely optional" contract at the
  action layer), and a "vendor alert" block proving the redundant-channel
  contract explicitly (not just claiming it): calls `notifyVendor` with the
  booth's `vendor_id` and a message containing the order number/total,
  skips silently when the booth can't be resolved, and a `notifyVendor`
  rejection doesn't change `placeOrder`'s own returned result.
- `page.tsx` — `OrderEntryPage` (route entry, `revalidate=0`): resolves the
  booth via `get_booth_for_order(p_short_code)` (public-safe — omits
  `cost_cents`/`short_code`), distinguishes a real RPC error (shows a
  retryable `ExpiredCode variant="error"`) from an unresolved code (hard
  `ExpiredCode`), computes open/closed state via `isBoothOpen`/
  `nextOpenLabel`, and renders the booth header, `RecentOrders`, a closed
  banner when applicable (with the booth's resolved social links, so a
  stranded customer can still reach the vendor — `get_booth_for_order`
  resolves booth-override-vs-vendor-default, migration `0053`), and
  `OrderForm`.
- `loading.tsx` — animated skeleton (title bar + 5 placeholder menu rows)
  shown while `page.tsx`'s server fetch resolves — the QR-scan hot path,
  where event-site network can be slow.

## Connectivity

Reached at `/o/<short_code>` from a booth's QR code. `page.tsx` renders
`OrderForm` (`@/components/order/order-form.tsx`), which imports and calls
this folder's `actions.ts#placeOrder` directly on submit; on success it
navigates to `/order/[boothId]/[orderNumber]?t=<accessToken>` for live status.
`placeOrder` also calls `@/lib/merqo-customer-notify`'s `notifyVendor` via its
own `notifyVendorTelegram` helper — merqo's shared bot resolves the vendor's
linked chat itself; a vendor connects that link once via merqo's own
`/profile` page, not through anything in this repo.

## Parent

[o](../README.md)
