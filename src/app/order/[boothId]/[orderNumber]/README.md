# [orderNumber]

## Purpose

Live customer order-status page — the page a customer lands on right after
placing an order (and can return to via "recent orders"). Polls status and
payment state, shows a PayNow/QR/link pay panel when the booth expects
payment, offers a "Get notified on Telegram" connect button while the order
is still waiting, and surfaces a loyalty "earn a stamp" link once the order
completes.

## Contents

- `earn-link.tsx` — `EarnLink({ orderId, vendorId, loopkitBaseUrl })` (async
  server component): fetches the vendor's LoopKit earn-program config from
  `NEXT_PUBLIC_LOOPKIT_URL` (bearer-authed with `MERQO_METRICS_SECRET`,
  3s timeout, fails closed to `{ enabled: false }` on any error/timeout) and
  renders an "Earn a stamp" link to `loopkit/earn?order=<id>` only when
  enabled.
- `earn-link.dom.test.tsx` — RTL tests for `EarnLink`'s enabled/disabled/
  fetch-failure branches.
- `telegram-connect.tsx` — `TelegramConnect({ orderId, vendorId })` (async
  server component, same shape as `EarnLink`): mints a single-order-scoped
  connect token from merqo (`mintCustomerConnectToken`,
  `@/lib/merqo-customer-notify`, `notify_ref` `` `qkit:${orderId}` ``) and
  renders the deep-link button plus a one-line disclosure preview — merqo's
  own connect flow holds the actual consent copy, this never restates or
  diverges from it — or `null` on any mint failure (a merqo outage must
  never break this page, same fail-closed rule as `EarnLink`).
- `telegram-connect.dom.test.tsx` — RTL tests for `TelegramConnect`'s
  successful-mint (link + disclosure) and failed-mint (`null`) branches.
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
  vendor's own board). Kitchen status and payment status advance
  independently (a vendor can mark an order preparing/ready before the
  customer pays), so an `awaitingPayment` prop (from `page.tsx`) overrides
  the confirmed/preparing/ready copy while payment is still outstanding —
  e.g. "Being prepared, please complete your payment" instead of "Your
  order is being prepared" — so the text never implies payment is settled
  when it isn't. Once past `pending`, renders the progress bar
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
  null), gates the pay panel purely on the local `order.payment_status`
  mirror (`!== 'not_required'` and not cancelled — set by `qkit.place_order`
  at order-creation time from `booths.payment`'s `{kind}` marker), and when
  shown calls paykit's `createCheckout` (`@/lib/paykit/client`, idempotent on
  `order.id` as `order_ref`) to get the actual QR/link/image to render,
  degrading to no pay panel (logged, not thrown) on any paykit failure — same
  "never strand a customer holding a valid order link" philosophy as the
  vendor-profile/daily-display-number reads below. From that same `showPay`
  gate plus `order.payment_status !== 'confirmed'`, an
  `awaitingPayment` flag passed to `OrderStatusPoller` so its status copy
  never outruns the actual payment state, and renders the ticket
  header, `OrderStatusPoller`, `TelegramConnect` (gated on
  `!isTerminal(order.status) && order.status !== 'ready'` plus
  `booth?.vendor_id` — the connect button only makes sense while the order
  is still waiting), the resolved social links (`SocialLinksRow`,
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
- `page.dom.test.tsx` — RTL test rendering `OrderStatusPage` directly (same
  pattern as `src/app/dashboard/layout.dom.test.tsx`: an async Server
  Component page can be awaited and its returned tree rendered like any
  other component), with every nested async/side-effecting child
  (`OrderStatusPoller`, `EarnLink`, `next/dynamic`'s `PayPanel`) stubbed out
  so the test stays focused on `TelegramConnect`'s gating: renders while
  `status` is `pending`/`confirmed`/`preparing`, not once
  `ready`/`completed`/`cancelled`.
- `pay-panel.tsx` — `PayPanel({ boothId, orderNumber, token, checkout,
initialStatus, amountCents })` client component: polls `getPaymentStatus`
  every 5s until `confirmed`/`not_required`; renders a QR
  (`react-qr-code`), an uploaded payment-QR image, or a pay link depending on
  `checkout.type` (now paykit's `CheckoutView`, `@/lib/paykit/client`) — the
  heading names the scan target explicitly ("Scan with your PayNow banking
  app to pay" for `type: "qr"`, a generic "banking or payment app" for a
  vendor-uploaded `type: "image"` since its provider is unknown) so a
  customer doesn't reach for a plain camera/QR scanner, which can't parse an
  EMVCo payload and would report it as invalid; lets the customer self-report
  via `claimPayment` ("I've paid"), with a "Tapped by mistake? Undo" text
  button (calling `unclaimPayment`) while `claimed` and unconfirmed; shows a
  persistent confirmed state once the vendor marks it paid.
- `pay-panel.dom.test.tsx` — RTL tests for the claim flow, each checkout
  type's rendering, and the confirmed/not-required terminal states.
- `payment-actions.ts` — service-client server actions: `getPaymentStatus`
  (read-only poll of the local `orders.payment_status` mirror — cheaper than
  round-tripping paykit every 5s), `claimPayment` (customer self-report,
  rate-limited 10/60s per IP+booth; calls paykit's `createCheckout`
  — idempotent, re-fetching the transaction `page.tsx` already created for
  this order — then `claimCheckout`, and mirrors the result into
  `orders.payment_status` afterward; no-ops on a cancelled order or a repeat
  claim without calling paykit again), and `unclaimPayment` (the "Tapped by
  mistake? Undo" companion, same rate-limit/lookup shape; re-fetches the same
  paykit transaction via `createCheckout` — there's no stored transaction id
  — then calls `unclaimCheckout`, idempotent on already-`pending` and
  refusing to revert a `confirmed` transaction, which paykit enforces itself
  and this mirrors with a fast local pre-check). paykit is authoritative for
  whether the claim/unclaim itself succeeded; a failed local mirror write
  still reports success to the customer.
- `payment-actions.test.ts` — unit tests for the claim/unclaim guards,
  rate-limiting, paykit-call mocking, and idempotency (including "already
  claimed/confirmed skips paykit entirely" and "already pending/confirmed
  skips paykit entirely" for unclaim).
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
  always computable once the order exists and is unaffected by anything
  below; `seconds` is forced `null` outright when the vendor's
  `board_settings.show_wait_estimate` is off (default `true` — never a
  minute guess in that case, however much real history exists), otherwise
  computed via `estimateWaitSeconds` (the booth's recent completed-order
  average × `ordersAhead`), falling back to the vendor's `board_settings.
default_prep_minutes` (× 60 × `ordersAhead`) when there isn't enough recent
  history to trust the real average, and null only when neither is
  available. `null` for the whole result (not just `seconds`) means there's
  nothing to say at all (order not found).

## Connectivity

Reached at `/order/{boothId}/{orderNumber}?t=<accessToken>` — the URL
`placeOrder` (in `src/app/o/[code]/actions.ts`) returns on success, and the
link `RecentOrders`/`ReorderButton` construct for a past order. `page.tsx`
composes `OrderStatusPoller` (polls `status-actions.ts`) and `PayPanel`
(polls/mutates via `payment-actions.ts`) — both bypass RLS via the service
client since the customer is anonymous and the per-order `access_token` is
the sole authorization. `page.tsx` and `payment-actions.ts` both call out to
paykit's checkout API (`@/lib/paykit/client`) for the actual QR/link/image
and the claim transition; `EarnLink` calls out to the separate LoopKit
service, and `TelegramConnect` calls out to merqo's `customer-connect-token`
endpoint (`@/lib/merqo-customer-notify`) — the first kit → merqo HTTP
direction in this codebase.

## Parent

[[boothId]](../README.md)
