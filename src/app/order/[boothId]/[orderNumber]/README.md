# [orderNumber]

## Purpose

Live customer order-status page — the page a customer lands on right after
placing an order (and can return to via "recent orders"). Polls status and
payment state, shows a PayNow/QR/link pay panel when the booth expects
payment, and surfaces a loyalty "earn a stamp" link once the order completes.

## Contents

- `earn-link.tsx` — `EarnLink({ orderId, vendorId, loopkitBaseUrl })` (async
  server component): fetches the vendor's LoopKit earn-program config from
  `NEXT_PUBLIC_LOOPKIT_URL` (bearer-authed with `MERQO_METRICS_SECRET`,
  3s timeout, fails closed to `{ enabled: false }` on any error/timeout) and
  renders an "Earn a stamp" link to `loopkit/earn?order=<id>` only when
  enabled.
- `earn-link.dom.test.tsx` — RTL tests for `EarnLink`'s enabled/disabled/
  fetch-failure branches.
- `loading.tsx` — animated skeleton matching the real ticket's shadow/layout,
  shown while `page.tsx`'s server reads resolve.
- `order-status-poller.tsx` — `OrderStatusPoller` client component: polls
  `getOrderStatus` every 5s (`usePolling`, paused once terminal) — poll-only
  by design since Supabase realtime is unreliable on customer devices
  (Safari/iOS, in-app webviews). Renders the progress bar
  (`orderProgressIndex`/`ORDER_PROGRESS_SEGMENTS`), an "Alert me when it's
  ready" opt-in that unlocks audio + requests `Notification` permission, and
  on transition to `"ready"` fires a system notification
  (`fireReadyNotification`), plays a chime, or flashes the tab title if
  backgrounded.
- `order-status-poller.dom.test.tsx` — RTL tests covering the poll loop,
  status transitions, the ready-state alert/notification/title-flash paths,
  and the enable-alerts permission flow.
- `page.tsx` — `OrderStatusPage` (route entry, `revalidate=0`): validates
  `boothId`/`orderNumber`/the `?t=` access token, reads the order + booth in
  parallel via the **service client** (customers are unauthenticated; the
  token match is what authorizes the read, not RLS), distinguishes a real
  DB error (retryable error boundary) from a genuine 404 (`maybeSingle` →
  null), computes whether to show the pay panel
  (`renderCheckout` from `@/lib/payments/adapters`), and renders the ticket
  header, `OrderStatusPoller`, `PayPanel`, the itemized order, `FeedbackForm`,
  `EarnLink` (once completed), the booth's resolved social links
  (`SocialLinksRow`, `@/components`), and a reorder/"order again" link.
- `pay-panel.tsx` — `PayPanel({ boothId, orderNumber, token, checkout,
initialStatus, amountCents })` client component: polls `getPaymentStatus`
  every 5s until `confirmed`/`not_required`; renders a QR
  (`react-qr-code`), an uploaded payment-QR image, or a pay link depending on
  `checkout.type`; lets the customer self-report `claimPayment`/
  `unclaimPayment` ("I've paid" / "Undo"); shows a persistent confirmed state
  once the vendor marks it paid.
- `pay-panel.dom.test.tsx` — RTL tests for the claim/unclaim flow, each
  checkout type's rendering, and the confirmed/not-required terminal states.
- `payment-actions.ts` — service-client server actions:
  `getPaymentStatus` (read-only poll target), `claimPayment` (customer
  self-report, rate-limited 10/60s per IP+booth, narrowly guarded to flip
  only `pending → claimed`, no-ops on a cancelled order or a repeat claim),
  `unclaimPayment` (mirror undo, `claimed → pending`, cannot undo a
  vendor-`confirmed` payment).
- `payment-actions.test.ts` — unit tests for the claim/unclaim guards,
  rate-limiting, idempotency, and the re-read fallback that distinguishes a
  harmless double-tap from a genuine failure.
- `status-actions.ts` — `getOrderStatus(boothId, orderNumber, token)`:
  service-client read of just the `status` column, token-gated, used by the
  poller; logs only real DB/network errors (an unknown order is a normal
  null).

## Connectivity

Reached at `/order/{boothId}/{orderNumber}?t=<accessToken>` — the URL
`placeOrder` (in `src/app/o/[code]/actions.ts`) returns on success, and the
link `RecentOrders`/`ReorderButton` construct for a past order. `page.tsx`
composes `OrderStatusPoller` (polls `status-actions.ts`) and `PayPanel`
(polls/mutates via `payment-actions.ts`) — both bypass RLS via the service
client since the customer is anonymous and the per-order `access_token` is
the sole authorization. `EarnLink` calls out to the separate LoopKit service.

## Parent

[[boothId]](../README.md)
