# PayNow hardening pass (2026-07-29)

Scope: Phase 1 job board's Track D / QA-D1 — prove the _existing_ qkit
PayNow flow works, not a paykit swap (that's Phase 2). Code-level verify done
today; live-hardware proof with a real vendor still open.

## Code-level verify (done)

- `src/lib/payments/paynow.ts` — EMVCo payload builder. `paynow.test.ts` (5
  tests) passing, including a CRC-16/CCITT-FALSE known-check-value assertion
  (`crc16("123456789") === 0x29B1`, the official test vector) and a
  UTF-8-byte-length assertion for a non-ASCII payee name (CJK stall names
  declare the correct TLV length banking apps actually parse).
- `src/lib/payments/adapters.ts` — `renderCheckout` correctly routes a
  `paynow` config to `buildPayNowPayload` with the order's real
  `amountCents`/`orderRef`; `adapters.test.ts` (5 tests) passing.
- `pay-panel.tsx` — renders the EMVCo payload as a QR (`react-qr-code`),
  shows the amount for sanity-check, has the `T35` image-QR `onError`
  fallback (for the `pointer`/image checkout kind) already shipped, polls
  payment status every 5s so a vendor's "Confirm payment" reflects on the
  customer's device.
- `payment-actions.ts` (`claimPayment`/`unclaimPayment`/`getPaymentStatus`)
  — token-scoped (booth_id + order_number + access_token, all three must
  match), rate-limited (10/min per IP+booth), idempotent on double-tap,
  excludes cancelled orders, and a customer can never self-set `confirmed`
  (vendor-only, via `order-actions.ts#confirmOrderPayment`) — so a claim is
  only ever a hint, matching the "qkit never touches funds" invariant.
- No bugs found. Full suite (890 tests) + `pnpm check` + `pnpm build` all
  green after this pass (see the F3-gap commit's verify run, same session).

## Live-hardware proof (done, 2026-07-29)

Verified end-to-end against a real bank app: local Supabase + qkit dev
server, Kopitiam Cart booth's PayNow config repointed to a real mobile
number, placed a real order ($1.40) through the actual customer checkout
flow, rendered QR scanned with a real banking app on a real phone —
recipient name and amount both parsed correctly. Confirms `buildPayNowPayload`

- `renderCheckout` + `pay-panel.tsx`'s `react-qr-code` render produce a
  QR real banking apps accept, not just a structurally-valid EMVCo string.

One unrelated finding: the order-status page logs a caught, non-fatal
`get_or_create_vendor_profile failed: Invalid schema: merqo` error when
running qkit standalone against a fresh local DB — the `merqo` schema is
provided by the separate merqo hub repo's own migrations, absent here.
Doesn't affect payment or order status rendering; not a PayNow bug, not
pursued further.

Original scoping below, for reference:

1. `docker` running, `supabase start`, apply migrations +
   `supabase/seed/coffee-cart.sql` (seeds the "Kopitiam Cart" booth).
2. `pnpm dev`, open the booth's customer order page, place an order with
   PayNow configured (`dashboard/booths` → payment section → PayNow QR, a
   real UEN or mobile number so the QR is scannable).
3. Scan the generated QR with a real banking app on a real phone — confirm
   it parses (payee name, amount, reference) and completes without the app
   flagging it invalid.
4. Tap "I've paid" on the customer page → confirm the vendor dashboard shows
   "Says paid" (`payment_status: claimed`) → tap "Confirm payment received"
   on the board → confirm the customer page flips to "Payment confirmed"
   within one 5s poll.

Log anything that breaks here as a normal bug-fix PR — this doc is the
tracking point so it isn't silently skipped, not a spec to build against.
