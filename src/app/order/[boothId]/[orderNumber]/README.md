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
  `getOrderStatus` + `getWaitEstimate` every 5s (`usePolling`, paused once
  terminal) — poll-only by design since Supabase realtime is unreliable on
  customer devices (Safari/iOS, in-app webviews). While `status === "pending"`
  (a booth with `requires_arrival_confirm` on — see
  `src/app/dashboard/booths/README.md`) it renders a dedicated early-return
  branch instead of the normal ticket: no progress bar/badge chrome, just a
  "We start making it fresh once you're at the counter" message and a big
  "I'm here, start my order" button that calls `confirmArrival` (optimistic
  local `setStatus("preparing")` on success, an error toast on failure) —
  the customer stays on this branch until either they tap it or the next
  poll observes the vendor already started it some other way (e.g. the
  vendor's own board). Once past `pending`, renders the progress bar
  (`orderProgressIndex`/`ORDER_PROGRESS_SEGMENTS`), a prominent range-based
  wait estimate (`estimateRangeLabel`, e.g. "6-10 min" — a range rather than
  a precise countdown, since waiting-line research says an unmet precise
  promise erodes trust more than an upfront-honest range) that falls back to
  a queue-position label (`queuePositionLabel`, e.g. "2 orders ahead of
  you") instead of showing nothing when there isn't enough recent history
  for a time estimate yet, an "Alert me when it's ready" opt-in that unlocks
  audio + requests `Notification` permission, and on transition to `"ready"`
  fires a system notification (`fireReadyNotification`), plays a chime, or
  flashes the tab title if backgrounded.
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
  header, `OrderStatusPoller`, the resolved social links (`SocialLinksRow`,
  `@/components`, booth override else the vendor's shared default from
  `merqo.vendor_profile` via `getOrCreateVendorProfile` —
  `@/lib/merqo-vendor-profile` — degrading to booth-only links on any RPC
  error rather than breaking the page for a customer holding a valid, paid
  order link) pulled up next to the status/ETA block rather than the
  footer (a customer watches this page idle for several minutes; the
  engagement content belongs near what they're already looking at), `PayPanel`,
  the itemized order, then — only once `order.status === "completed"` (a
  mid-task feedback request is both more annoying and lower-quality than
  the same ask post-completion) — `FeedbackForm`, `EarnLink`, and a
  reorder/"order again" link. The big order-number heading is
  `order.order_number` by default, or (when the vendor's
  `board_settings.daily_order_number_reset` is on) a `displayOrderNumber`
  computed from a small extra read of that vendor's setting plus the booth's
  first order of the SGT day (`sgtStartOfDayIso`) — same display-only rule
  the vendor board applies, degrading silently to the real number on any
  read failure (decorative, never worth breaking the page over). `PayPanel`'s
  `orderRef` always stays the real, permanent number regardless — that one's
  for payment reconciliation, not display.
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
  null). `confirmArrival(boothId, orderNumber, token)`: the customer-
  triggered arrival confirmation for a booth with `requires_arrival_confirm`
  on — flips the order from `'pending'` (the status `place_order`, migration
  0064, inserts it at when the booth requires arrival confirmation) to
  `'preparing'`, starting prep. Token-gated and rate-limited exactly like
  `claimPayment` in `payment-actions.ts` (10/60s per IP+booth — small
  sequential order numbers are easy to enumerate); on a 0-row update it
  re-reads the order to distinguish a harmless double-tap (already started,
  e.g. the vendor hit "Start now" first — reported as success) from a real
  failure (still pending, cancelled, or missing). `getWaitEstimate(boothId, orderNumber, token)`: returns
  `{ seconds, ordersAhead } | null` — `ordersAhead` (via `ordersAheadOf`) is
  always computable once the order exists; `seconds` (via
  `estimateWaitSeconds`, the booth's recent completed-order average ×
  `ordersAhead`) falls back to the vendor's `board_settings.
default_prep_minutes` (× 60 × `ordersAhead`) when there isn't enough recent
  history to trust the real average, and is null only when neither is
  available. `null` itself means there's nothing to say at all (order not
  found).

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
