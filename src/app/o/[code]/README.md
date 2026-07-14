# [code]

## Purpose

Customer menu + cart + checkout for a booth, keyed by its short QR code —
the current (non-legacy) customer ordering entry point.

## Contents

- `actions.ts` — `placeOrder(code, input, idempotencyKey)` server action:
  validates `code`/`idempotencyKey`/`input` (`placeOrderSchema`), applies a
  best-effort per-IP flood guard (`rateLimit`, 8/60s, fails open), then calls
  the `place_order` RPC. Maps known Postgres `RAISE` prefixes
  (`ORDER_EXPIRED`/`ORDER_UNSERVABLE`/`ORDER_SOLD_OUT`/
  `ORDER_ITEM_UNAVAILABLE`/`ORDER_RATE_LIMITED`) to customer-facing messages
  via `messageFor()`, logs only the genuinely-unexpected failures, and on
  success fires the `order_placed` analytics event and returns
  `{ orderNumber, boothId, accessToken }`.
- `actions.place-order.test.ts` — unit tests (RPC mocked) covering: the
  expired-code message mapping, a successful order, the action-level flood
  guard rejecting before `place_order` is ever called, fail-open behaviour
  when the limiter RPC itself errors, every known raise→message mapping via
  `it.each`, a malformed-RPC-output guard, and rejection of a non-UUID
  idempotency key before any RPC call.
- `page.tsx` — `OrderEntryPage` (route entry, `revalidate=0`): resolves the
  booth via `get_booth_for_order(p_short_code)` (public-safe — omits
  `cost_cents`/`short_code`), distinguishes a real RPC error (shows a
  retryable `ExpiredCode variant="error"`) from an unresolved code (hard
  `ExpiredCode`), computes open/closed state via `isBoothOpen`/
  `nextOpenLabel`, and renders the booth header, `RecentOrders`, a closed
  banner when applicable, and `OrderForm`.
- `loading.tsx` — animated skeleton (title bar + 5 placeholder menu rows)
  shown while `page.tsx`'s server fetch resolves — the QR-scan hot path,
  where event-site network can be slow.

## Connectivity

Reached at `/o/<short_code>` from a booth's QR code. `page.tsx` renders
`OrderForm` (`@/components/order/order-form.tsx`), which imports and calls
this folder's `actions.ts#placeOrder` directly on submit; on success it
navigates to `/order/[boothId]/[orderNumber]?t=<accessToken>` for live status.

## Parent

[o](../README.md)
