# Payment-first checkout + self-checkout pickup (design)

Source: Manfred's second AAR feature backlog (`docs/meta/2026-09-10-manfred-second-aar-feature-backlog.md`),
items C (self-checkout pickup verification) and a UX refinement to the
existing payment flow raised in the same design conversation. Item B
(customer queue display) already shipped (PR #144). This spec combines the
payment-flow reorder with item C's pickup mechanic per an explicit decision
to land them together rather than sequence them — see "Sequencing" below.

## Problem

1. Today, `placeOrder` creates an order and immediately redirects to the
   order-status page. The payment panel renders inside that same page,
   below the order number. Vendors see every order the instant it's
   placed, before any payment signal exists — nothing stops a vendor from
   starting prep on an order that never gets paid.
2. PayNow/PayLah have no payment API — no webhook can tell qkit a payment
   went through. Today's workaround (`claimPayment`/`confirmOrderPayment`,
   already shipped) requires the customer to physically show their bank
   app's success screen to the vendor before the vendor taps "Confirm
   payment" on the board. This is the exact standard-practice friction
   documented for static PayNow QR codes in Singapore — "turn your phone
   around and show the confirmation screen to the owner"
   ([Sethisfy](https://sethisfy.com/wallet-apps-for-hawkers-and-dining/)) —
   not a qkit-specific gap.
3. Manfred's AAR pain point #3: pickup mix-ups at handoff ("10, 10, 10,
   10", queue-jumping) because a staff member manually matches a shouted
   number to a customer.

## Research (existing products)

- **QSR "pay before you get a number"** (McDonald's, Starbucks, Grab/foodpanda
  pickup apps): payment always completes before the customer sees an order
  number or ticket. This validates the user's instinct and is the model
  for the new customer flow below.
- **Luckin Coffee's real self-pickup mechanic** ("scan at the counter to
  collect"): the customer's **app displays a QR code**, and a **scanner at
  the shelf/counter** (staff-side hardware) reads it to confirm collection.
  This is the OPPOSITE of what our backlog doc assumed and **requires
  dedicated scanner hardware**, which the backlog explicitly rules out for
  qkit's hawker-stall context (no budget, no register). qkit's mechanic is
  therefore **adapted, not copied**: the QR lives on the printed cup label
  (no phone display needed) and the CUSTOMER's own phone scans it (no
  scanner hardware needed). This trades a small amount of rigor (whoever
  holds the cup can scan its label — same trust level as whoever physically
  holds a paper claim ticket today) for zero hardware cost, which matches
  the AAR's own constraint.
- **Real webhook-verified PayNow** (Stripe PayNow, Rapyd PayNow) exists only
  through registered payment-gateway integrations — out of scope. paykit's
  own rule (`paykit/AGENTS.md:180-181`) explicitly forbids adding "a
  payment-provider SDK, a webhook that moves money, or a real auto-verify
  integration." This is why the proof-of-payment approach below stays a
  human-reviewed hint, never an auto-verify.

## Scope

**In scope (this spec, qkit only):**

- Payment-first customer checkout flow.
- Vendor board visibility gated on payment claim.
- Async proof-of-payment (screenshot upload, vendor reviews on their own
  time, no more physical show-your-screen).
- Self-checkout pickup: customer scans the cup's printed QR with their own
  phone to mark an order collected, staff one-tap fallback stays.

**Out of scope (separate spec/PR, different repo):**

- printkit's label template gaining QR-rendering support (see
  "Cross-repo dependency" below).
- OCR hint on the proof screenshot — separate spike first (Tesseract.js
  has documented Vercel/Next.js bundling fragility;
  [naptha/tesseract.js#868](https://github.com/naptha/tesseract.js/issues/868),
  [Vercel Community thread](https://community.vercel.com/t/tesseract-js-can-no-longer-find-the-wasm-file-on-vercel/6788)).
- Any real payment-gateway webhook integration (against paykit's own rules).
- Shelf-slot software tracking — the shelf is a physical numbered rack
  matching the existing display number; no new data model for it.

## Data model changes

New migration (next number, `0087_...sql`, written to
`supabase/migrations/` — applied by you via the SQL editor per usual, never
run directly):

- `orders.payment_proof_path text null` — storage path of the customer's
  uploaded payment screenshot, in a new **private** bucket `payment-proofs`
  (NOT the existing public `booth-images` bucket — that bucket's adapter
  calls `getPublicUrl`, wrong trust level for a stranger's bank app
  screenshot). No public/anon storage policy; read only via the
  service-role client (a short-lived signed URL minted on demand for the
  vendor's board).
- `vendors.board_settings` (JSONB, `boardSettingsSchema` in
  `src/lib/schemas.ts`) gains `self_checkout_pickup_enabled:
z.boolean().default(false)` — **opt-in**, unlike
  `customer_telegram_notify_enabled`'s default-true (that flag preserved
  existing behavior; this one introduces new behavior a vendor must choose,
  including a printed-label change and a physical shelf workflow they need
  to actually run).

No new table. No change to `orders.status`'s state machine (`pending` →
`preparing` → `ready` → `completed`/`cancelled`, `ADVANCE` map in
`src/lib/orders.ts`) — collection still lands on the existing `completed`
status via the existing `buildAdvancePatch("completed", …)`, just reached
by a new caller.

## Customer flow

```
placeOrder creates the order (order_number + access_token assigned, as today)
        │
        ├─ payment required (payment_status != "not_required")?
        │     └─ YES → redirect to NEW page
        │              /order/{boothId}/{orderNumber}/pay?t=token
        │              (payment-only: amount, QR/link/image, "I've paid" +
        │               required proof-photo upload — no order number, no
        │               items shown yet, matching the QSR "pay before you
        │               get a number" pattern above)
        │              on successful claim (photo uploaded + submitted) →
        │              redirect to the existing order-status page
        │
        └─ NO → straight to /order/{boothId}/{orderNumber}?t=token
                 (today's page, unchanged entry point)
```

The existing order-status page is extended, not replaced:

- Unchanged for a `not_required` order.
- For a payment-required order arriving post-claim, the existing
  `PayPanel` still renders (showing "waiting for the stall to confirm" /
  "Payment confirmed" states) — this spec doesn't remove that, it just
  moves the _first_ payment interaction to its own page before the number
  reveal. A customer who navigates back to `/pay` after already claiming
  sees a "already submitted" state, not the form again.
- New: when `status === "ready"` AND the booth's vendor has
  `self_checkout_pickup_enabled`, an **"I've got it — mark as collected"**
  button appears. No new route for this — the cup's printed QR re-encodes
  this SAME existing status-page URL (`/order/{boothId}/{orderNumber}?
t=token`), so scanning it either opens a page the customer may already
  have bookmarked/open, or opens it fresh; either way the button is right
  there once the order is `ready`.

## Vendor flow

- **Board visibility** (`use-realtime-orders.ts` query + realtime filter):
  excludes `payment_status = 'pending'`. A vendor never sees an order until
  the customer has at least claimed payment (or it's `not_required`).
- **`order-card.tsx`**, `claimed` orders: shows the uploaded proof-photo
  thumbnail (tap to enlarge via a signed URL, minted on demand — never
  embedded pre-signed in the realtime payload, since signed URLs expire)
  next to the existing "Confirm payment" button. The vendor now reviews
  asynchronously, at their own time, never needing the customer physically
  present.
- **`order-card.tsx`**, `ready` orders: when `self_checkout_pickup_enabled`
  is on, a small "customer can self-collect" hint. The existing one-tap
  "Mark Picked Up" (F3, `ADVANCE.ready`) stays untouched as the staff
  fallback for a customer whose phone has no battery/data — exactly the
  "scan-primary with a staff fallback" semantics the backlog already
  confirmed.

## New/changed server actions

- **`claimPayment`** (`payment-actions.ts`): now requires an uploaded
  photo. Upload goes to the new private `payment-proofs` bucket via the
  service client (the bucket has no anon/public policy, so this can't go
  through the client-side `ImageUploader`/`image-upload-adapter.ts` path
  used for menu photos — that path assumes a public bucket). If the upload
  fails, the claim fails outright — the photo IS the claim, not an
  optional extra. Reuses `rateLimit`/`clientIp`
  (`src/lib/rate-limit.ts`, already used here) and `image-resize.ts` to
  downscale client-side before upload.
- **`confirmCollection(boothId, orderNumber, token)`** (new action, new file
  `[orderNumber]/collect-actions.ts` — a distinct concern from payment,
  kept out of `payment-actions.ts` rather than overloading that file):
  the customer-facing equivalent of `advanceOrder`, but service-client-based
  (customer is anonymous, no `getUser()` session) instead of RLS-scoped.
  Verifies the order via `booth_id`+`order_number`+`access_token` (same
  pattern as every other customer action), checks current `status ===
"ready"` (else returns a clear "not ready yet" / "already collected"
  result — never a hard error, matching this file's existing idempotent
  style), applies the SAME `buildAdvancePatch("completed", now,
payment_status)` from `src/lib/orders.ts` that `advanceOrder` uses (this
  is intentional, not a shortcut — verified below), and calls
  `recordOrderStatusEvent({ order_id, from_status: "ready", to_status:
"completed", actor: null })` — `actor` is a nullable FK
  (`order_status_events.actor uuid references auth.users(id)`, migration
  0078), already designed to allow a non-vendor-authenticated write.
  Rate-limited the same way as `claimPayment`.
- **A signed-URL action** for the vendor board to fetch a proof photo
  on demand (short expiry, vendor-session-gated via existing RLS-scoped
  reads, not service-role — the vendor must own the booth).

## Consistency verification (confirmation sweep findings)

- **Payment auto-confirm on completion is intentional, already shared
  behavior — not a new risk.** `buildAdvancePatch("completed", …)`
  already auto-confirms a `pending`/`claimed` payment on completion
  ("Handing the order over implies the money has changed hands" —
  `src/lib/orders.ts:120-131`). This already happens today when a _vendor_
  taps "Mark Picked Up" on an order they never explicitly confirmed
  payment for. Routing the customer's own self-checkout scan through the
  same `buildAdvancePatch` call doesn't introduce a new fraud surface — a
  `ready` order can only exist because the vendor already saw it and its
  proof photo on the board (board visibility itself gates on `claimed`, and
  vendor progresses it through `preparing` before it ever reaches `ready`),
  so by construction payment must already be at least `claimed` by the
  time collection is possible.
- **No RLS gap.** `confirmCollection` runs on the service-role client, same
  boundary already established for `claimPayment`/`unclaimPayment`
  (customer is anonymous; RLS has no anon policy for `orders` UPDATE, by
  design).
- **Accepted gap, not fixed here:** an order stuck at `payment_status =
"pending"` forever (customer abandons before claiming) never appears on
  the vendor board and has no vendor-facing cancel action. Admin's existing
  `src/lib/stuck-orders.ts` health view still eventually flags it (it scans
  by `order.status`, unaffected by `payment_status`), just not from the
  vendor's own board. No customer-facing harm (a dead unpaid row); revisit
  only if it becomes real friction.

## Cross-repo dependency (printkit — separate spec/PR, not built here)

`createPrintJob`'s payload (`src/lib/printkit/client.ts`) today is
`{ customer_name, order_number }` — plain text, no QR. Printing the pickup
QR needs:

1. qkit sends a new payload field (e.g. `collect_url`), only when the
   booth's `self_checkout_pickup_enabled` is on.
2. printkit's own label template needs to render a payload URL field as a
   QR code — it doesn't today. This is printkit-repo work, tracked as a
   dependency of this feature, not built as part of this qkit spec.

## Error handling & edge cases

- Upload failure at claim time → claim rejected, customer told to retry;
  never flips to `claimed` without a stored proof path.
- `confirmCollection` called on a non-`ready` order (already completed,
  still preparing, double-scan) → idempotent-friendly message, no error
  page; matches this file's existing style (`claimPayment`'s
  already-claimed handling).
- Booth without `self_checkout_pickup_enabled` → no collect button ever
  renders, no behavior change from today.
- Walk-up orders (no customer phone in the loop): explicitly out of scope
  for self-checkout completion — they stay on the existing staff one-tap
  path, matching the backlog's own still-open question, deferred rather
  than answered here.

## Testing

- `use-realtime-orders`/board query: excludes `pending`-payment orders.
- `claimPayment`: rejects a claim with no/failed photo upload.
- `confirmCollection`: ready→completed happy path, actor-null event
  logged, payment auto-confirm reused correctly, non-ready/already-
  completed idempotent responses, rate-limit enforcement.
- Storage: private bucket has no anon/public read policy
  (`supabase/tests/rls.test.sql`).
- `order-card.tsx`: renders proof thumbnail + confirm for `claimed`;
  renders self-collect hint for `ready` when the toggle is on.
- Order-status page: renders the collect button only when `ready` AND
  toggle on; `/pay` page redirects correctly based on `payment_status`.

## Judgment calls made (flagged for override)

- `self_checkout_pickup_enabled` is vendor-level (`board_settings`), not
  per-booth — matches every existing toggle's precedent. A vendor running
  multiple booths with different pickup models would need per-booth
  granularity instead; not built since no vendor has asked for it (YAGNI).
- Photo upload is mandatory on every claim, regardless of checkout type
  (`qr`/`link`/`image`) — one code path, no branching on payment provider.
- No new route for pickup — the printed QR reuses the existing order-status
  URL rather than a dedicated `/collect` path, since the token/auth/read
  logic already exists there.
