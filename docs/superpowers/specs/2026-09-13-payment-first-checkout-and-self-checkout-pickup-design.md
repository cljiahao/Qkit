# Payment-first checkout + scan-to-collect pickup (design)

Source: Manfred's second AAR feature backlog (`docs/meta/2026-09-10-manfred-second-aar-feature-backlog.md`),
item C (self-checkout pickup verification) and a UX refinement to the
existing payment flow raised in the same design conversation. Item B
(customer queue display) already shipped (PR #144). This spec combines the
payment-flow reorder with item C's pickup mechanic per an explicit decision
to land them together.

**Revision note (v2):** the pickup mechanic below is a deliberate reversal
of the backlog's original "no staff scan, no dedicated scanner hardware"
decision, made after checking real product precedent (see Research) and
live discussion. It is now **staff-scanned**, not customer-scanned — see
"Pickup mechanic pivot" for why.

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
  number or ticket. Validates the payment-first customer flow below.
- **Luckin Coffee's real self-pickup mechanic**: the customer's app
  displays a QR code, and a **scanner at the counter (staff-side hardware)**
  reads it to confirm collection — the opposite of what the backlog
  originally assumed (it had described a customer-scans-the-cup model).
  qkit's version below improves on Luckin's own approach: instead of
  needing the customer to pull up their phone at all, the QR is printed
  directly on the cup label (already produced per order via printkit), so
  staff scan the cup itself at handoff — no customer phone involved in
  pickup at all.
- **Real webhook-verified PayNow** (Stripe PayNow, Rapyd PayNow) exists only
  through registered payment-gateway integrations — out of scope. paykit's
  own rule (`paykit/AGENTS.md:180-181`) explicitly forbids adding "a
  payment-provider SDK, a webhook that moves money, or a real auto-verify
  integration." This is why the proof-of-payment approach below stays a
  human-reviewed hint, never an auto-verify.

## Pickup mechanic pivot: staff-scan, not customer-scan

Considered and rejected: customer scans the cup's QR with their own phone
camera. Rejected because it's genuinely clunky at a busy counter (open
camera/browser, focus on a curved cup surface, wait for decode) compared
to a dedicated scanner, and doesn't match how Luckin — the explicit
inspiration — actually works.

Considered and rejected: give printkit a scanner-hardware integration
(input, not print output). Unnecessary — a standard USB/Bluetooth
barcode/QR scanner is a **keyboard-emulating (HID) device**. It types the
decoded text plus an Enter keystroke into whatever has keyboard focus, with
no driver and no custom pairing protocol — completely unlike the NIIMBOT
label printer, which needs printkit specifically because printers require
real print-command protocol support. A HID scanner needs none of that, so
this stays entirely inside qkit, no printkit or cross-repo hardware work.

**Chosen approach:** a new vendor-authenticated page, `/dashboard/scan`,
with an auto-focused text input. Staff pairs a commodity Bluetooth
barcode/QR scanner (~SGD 20-30) to whatever device is running the page
(e.g. an iPad — pairs like any Bluetooth keyboard via Settings > Bluetooth;
iPadOS also auto-suppresses the on-screen keyboard whenever a physical/BT
keyboard is connected, so the focused input won't pop up the software
keyboard). Scanning the cup's printed QR types the encoded string + Enter
into the input automatically — no button press beyond the scan trigger
itself. The page parses the string on Enter, calls the collection action,
flashes a result, clears, and re-focuses for the next scan. No scanner
connected → the page just sits idle; staff use the existing one-tap "Mark
Picked Up" fallback instead.

**Security improvement this pivot enables:** since collection is now
staff-triggered from inside the authenticated `/dashboard`, the printed QR
no longer needs to carry the customer's private `access_token` (unlike
every other customer-facing per-order link). A photographable, physically
exposed printed label is a worse place to put a secret token than a private
chat/SMS link — the QR now encodes only the order id
(`qkit:collect:{orderId}`), harmless if photographed, since authorization
comes from the vendor's own login + RLS, not from possessing the code.

## Scope

**In scope (this spec, qkit only):**

- Payment-first customer checkout flow.
- Vendor board visibility gated on payment claim.
- Async proof-of-payment (screenshot upload, vendor reviews on their own
  time, no more physical show-your-screen).
- Scan-to-collect pickup: a vendor-authenticated `/dashboard/scan` page +
  Bluetooth HID barcode scanner, staff scans the cup's printed QR to mark
  an order collected. Existing one-tap "Mark Picked Up" stays as fallback.

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
- Renaming printkit to reflect a broader hardware-bridge role — this
  pivot needs zero printkit change (see above), so there's no second
  job-type to motivate a rename yet. Revisit only if/when printkit
  actually gains a non-print job type.

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
  `src/lib/schemas.ts`) gains `pickup_scan_enabled: z.boolean().default(false)`
  — **opt-in**, unlike `customer_telegram_notify_enabled`'s default-true
  (that flag preserved existing behavior; this one introduces new behavior
  a vendor must choose, including a printed-label change and buying a
  scanner).

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

The existing order-status page is extended, not replaced, and — unlike the
v1 draft of this spec — gets **no new pickup UI at all**: collection is
entirely staff-side now (see Pickup mechanic pivot). The page's only
change from today is the new `/pay` redirect branch above; a `not_required`
order's flow is completely unchanged.

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
- **New `/dashboard/scan` page**: auto-focused input, listens for the
  scanner's Enter-terminated keystroke stream, parses `qkit:collect:
{orderId}`, calls the collection action, shows a brief success/failure
  flash (order number + "Collected" or the failure reason), re-focuses.
  Only rendered/linked when `pickup_scan_enabled` is on.
- Existing one-tap "Mark Picked Up" (F3, `ADVANCE.ready`) is untouched —
  the fallback for a dead scanner, a damaged label, or a vendor who hasn't
  turned the capability on.

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
- **`confirmCollection(orderId)`** (new action, `src/app/dashboard/
scan-actions.ts`): **vendor-authenticated**, not anonymous — a real change
  from the v1 draft, made possible by the pivot to a staff-scanned,
  dashboard-hosted mechanic. Mirrors `advanceOrder`'s own shape
  (`loadOwnOrder`, RLS-scoped via `getUser()`, not service-role) but is
  its own function rather than a call into `advanceOrder` directly: it must
  refuse anything but `status === "ready"` and say why (`"Not ready yet"` /
  `"Already collected"`), where generic `advanceOrder` would instead
  silently advance a `preparing` order to `ready` (wrong — a premature or
  mis-scanned label must never quietly bump kitchen state). On success,
  applies the same `buildAdvancePatch("completed", now, payment_status)`
  `advanceOrder` uses (see Consistency verification) and calls
  `recordOrderStatusEvent({ order_id, from_status: "ready", to_status:
  "completed", actor: userId })` — `actor` is the scanning vendor's own
  session id, same attribution `advanceOrder` already records, not a null
  system actor (an improvement over the v1 draft's anonymous-token design).
- **A signed-URL action** for the vendor board to fetch a proof photo on
  demand (short expiry, vendor-session-gated via existing RLS-scoped
  reads, not service-role — the vendor must own the booth).

## Consistency verification (confirmation sweep findings)

- **Payment auto-confirm on completion is intentional, already shared
  behavior — not a new risk.** `buildAdvancePatch("completed", …)`
  already auto-confirms a `pending`/`claimed` payment on completion
  ("Handing the order over implies the money has changed hands" —
  `src/lib/orders.ts:120-131`). This already happens today when a _vendor_
  taps "Mark Picked Up" on an order they never explicitly confirmed
  payment for. `confirmCollection` reusing the same patch logic doesn't
  introduce a new fraud surface — a `ready` order can only exist because
  the vendor already saw it and its proof photo on the board (board
  visibility itself gates on `claimed`, and the vendor progresses it
  through `preparing` before it ever reaches `ready`), so by construction
  payment must already be at least `claimed` by the time collection is
  possible.
- **No RLS gap, and a cleaner authorization story than the v1 draft.**
  `confirmCollection` is vendor-authenticated (`getUser()` + RLS via
  `loadOwnOrder`, same boundary `advanceOrder` already uses) — no
  service-role bypass, no anonymous customer token needed at all, since
  the whole action now lives behind the vendor's own login.
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

1. qkit sends a new payload field (e.g. `collect_code`, the
   `qkit:collect:{orderId}` string), only when the booth's
   `pickup_scan_enabled` is on.
2. printkit's own label template needs to render a payload field as a QR
   code — it doesn't today. This is printkit-repo work, tracked as a
   dependency of this feature, not built as part of this qkit spec. No
   scanner-reading/input work is needed on printkit's side (see Pickup
   mechanic pivot) — only QR rendering on the print side.

## Error handling & edge cases

- Upload failure at claim time → claim rejected, customer told to retry;
  never flips to `claimed` without a stored proof path.
- `confirmCollection` called on a non-`ready` order (already completed,
  still preparing, double-scan, or a garbled/unparseable scan) →
  idempotent-friendly message on the scan page, no crash; matches this
  file's existing style (`claimPayment`'s already-claimed handling).
- No scanner connected / `pickup_scan_enabled` off → `/dashboard/scan`
  isn't linked from anywhere; staff use the existing board fallback.
- `/dashboard/scan`'s input loses focus (staff taps elsewhere on the
  tablet) → re-focus on blur, otherwise a scan silently types into
  nothing.
- Walk-up orders (no customer phone in the loop at all): unaffected by
  this pivot — since collection is staff-scanned, not customer-scanned, a
  walk-up order's printed label works exactly the same way as a QR-ordered
  one. This closes the backlog's own open question about walk-up
  participation, which the v1 (customer-scan) draft could not.

## Testing

- `use-realtime-orders`/board query: excludes `pending`-payment orders.
- `claimPayment`: rejects a claim with no/failed photo upload.
- `confirmCollection`: ready→completed happy path, vendor-actor event
  logged, payment auto-confirm reused correctly, non-ready/already-
  completed idempotent responses, RLS scoping (can't collect another
  vendor's order).
- Storage: private bucket has no anon/public read policy
  (`supabase/tests/rls.test.sql`).
- `order-card.tsx`: renders proof thumbnail + confirm for `claimed`.
- `/dashboard/scan`: parses a valid `qkit:collect:{orderId}` scan and
  calls `confirmCollection`; ignores/flags a garbled scan; re-focuses
  after each attempt; shows the right flash message for each outcome.
- `/pay` page: redirects correctly based on `payment_status`.

## Judgment calls made (flagged for override)

- `pickup_scan_enabled` is vendor-level (`board_settings`), not per-booth —
  matches every existing toggle's precedent. A vendor running multiple
  booths with different pickup models would need per-booth granularity
  instead; not built since no vendor has asked for it (YAGNI).
- Photo upload is mandatory on every claim, regardless of checkout type
  (`qr`/`link`/`image`) — one code path, no branching on payment provider.
- The printed QR encodes a bare order id, not a URL — it's read by a
  parsing input field on an internal dashboard page, not opened as a link,
  so a scannable short code is simpler than a full URL and avoids ever
  printing the customer's private access token on a physical label.
