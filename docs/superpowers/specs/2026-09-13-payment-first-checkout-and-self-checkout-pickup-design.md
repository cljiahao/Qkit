# Payment-first checkout + self-checkout pickup kiosk (design)

Source: Manfred's second AAR feature backlog (`docs/meta/2026-09-10-manfred-second-aar-feature-backlog.md`),
item C (self-checkout pickup verification) and a UX refinement to the
existing payment flow raised in the same design conversation. Item B
(customer queue display) already shipped (PR #144). This spec combines the
payment-flow reorder with item C's pickup mechanic per an explicit decision
to land them together.

**Revision history:**

- v1: customer scans the cup's QR with their own phone camera.
- v2: reversed to staff-scanned, vendor-authenticated `/dashboard/scan`
  (closer to Luckin's real mechanic, but reintroduces staff into the
  handoff — see below).
- **v3 (current):** reversed again to a true **self-checkout kiosk** —
  customer operates the scanner themselves, at an unattended public
  station. Matches the AAR backlog's own original goal ("removing staff
  from the handoff entirely") and real self-checkout precedent (grocery
  self-checkout lanes), not Luckin's staff-scan model. Also brings the OCR
  hint into scope (was deferred) after resolving the earlier Vercel/
  Next.js bundling concern.

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
  displays a QR code, and a scanner at the counter — **staff-side
  hardware** — reads it. Useful as a reality check (dedicated scanner
  hardware beats a phone camera at a busy counter), but its handoff still
  requires a staff member to be at the station. The AAR backlog's actual
  goal was "removing staff from the handoff entirely," which points to a
  different, better-fitting precedent:
- **Grocery-store self-checkout**: the customer operates the scanning
  hardware themselves, unattended. This is the model item C's own name
  ("self-checkout") actually describes, and what v3 below builds — closer
  to the backlog's original goal than a literal Luckin copy.
- **Real webhook-verified PayNow** (Stripe PayNow, Rapyd PayNow) exists only
  through registered payment-gateway integrations — out of scope. paykit's
  own rule (`paykit/AGENTS.md:180-181`) explicitly forbids adding "a
  payment-provider SDK, a webhook that moves money, or a real auto-verify
  integration." This is why the proof-of-payment approach below stays a
  human-reviewed hint, never an auto-verify.
- **Tesseract.js in the browser vs. on a Next.js server**: the earlier
  concern (documented, recurring Vercel/Next.js build failures —
  [naptha/tesseract.js#868](https://github.com/naptha/tesseract.js/issues/868),
  [Vercel Community thread](https://community.vercel.com/t/tesseract-js-can-no-longer-find-the-wasm-file-on-vercel/6788))
  is specific to bundling it into a **server** route/action — Next's
  server bundler tries to package the worker/WASM into the serverless
  function and fails. Running it **client-side only** (a WebWorker in the
  browser) sidesteps that path entirely — confirmed via tesseract.js's own
  docs and an independent write-up
  ([Transloadit](https://transloadit.com/devtips/integrating-ocr-in-the-browser-with-tesseract-js/)).
  This resolves the earlier blocker; see "OCR hint" below.

## Pickup mechanic: self-checkout kiosk

**Why not customer's own phone camera (v1):** clunky at a busy counter —
open camera/browser, focus on a curved cup surface, wait for decode —
compared to a dedicated scanner.

**Why not vendor-authenticated staff scan (v2):** it works, and is simpler
to secure (no secret needed on the printed label), but it still requires a
staff member to walk to a station and scan every cup — the AAR's own
stated goal was removing staff from the handoff entirely, not just making
their part of it faster.

**Why not a printkit scanner-hardware integration:** unnecessary either
way — a standard USB/Bluetooth barcode/QR scanner is a
**keyboard-emulating (HID) device**. It types the decoded text plus an
Enter keystroke into whatever has keyboard focus, with no driver and no
custom pairing protocol — completely unlike the NIIMBOT label printer,
which needs printkit specifically because printers require real
print-command protocol support. A HID scanner needs none of that, so this
stays entirely inside qkit regardless of which of the three mechanics
above is chosen.

**Chosen approach (v3):** a new **public, booth-scoped, unattended** page,
`/order/{boothId}/pickup`, with an auto-focused text input — sits open on
a tablet/iPad mounted at the pickup shelf, no login. The customer pairs
nothing themselves; the vendor pairs a commodity Bluetooth barcode/QR
scanner (~SGD 20-30) to that tablet once (Settings > Bluetooth, same as
any Bluetooth keyboard — iPadOS also auto-suppresses the on-screen
keyboard whenever a physical/BT keyboard is connected, so the focused
input never pops up the software keyboard). The customer picks up their
own cup and scans its printed QR themselves against the mounted
scanner — the scanner types the QR's content + Enter into the page's
input automatically, no button press beyond the scan gesture itself. The
page parses it, calls the collection action, flashes a result ("Order
#042 collected" / an error), clears, and re-focuses for the next customer.
No scanner connected → the page just sits idle; staff use the existing
one-tap "Mark Picked Up" board button as the fallback.

**Security trade-off of true self-checkout (accepted):** because this page
has no login to lean on, the printed QR **must** carry the same unguessable
`access_token` every other customer action already uses — a bare order id
would let anyone scan/type an arbitrary id into a public page. The QR
therefore encodes the **same existing customer order-status URL**
(`/order/{boothId}/{orderNumber}?t=token`), not a new bespoke code. Two
benefits of reusing that exact URL: the kiosk page parses it with the same
`orderBoothIdSchema`/`orderNumberSchema`/`orderTokenSchema` validation
already used everywhere else, and if a stray phone's QR scanner (not the
kiosk) ever reads the label, it just opens the customer's own order-status
page harmlessly instead of doing nothing or erroring. The trade-off:
a photographed label exposes the same thing a leaked chat link already
would (today's actual exposure for every order), just now on a physically
visible object — not a new class of risk, but a wider one than v2's
token-free label would have been. Accepted per explicit decision to
prioritize true self-checkout over that narrower exposure.

## OCR hint (now in scope, was deferred)

Client-side only, self-hosted, non-blocking hint layered on the vendor's
existing photo review (see Vendor flow) — never replaces the manual
Confirm button.

- `"use client"` component, dynamically imported (`next/dynamic`, same
  "don't ship this in every bundle" pattern already used for
  `PayPanel`/`react-qr-code`) — loads only when the vendor actually opens
  a claimed order's proof photo.
- **Self-hosted**, not the default CDN-mirror mode: tesseract.js's core/
  worker/`eng.traineddata` files ship under `/public/tesseract/` (a few MB,
  fetched once, cached by tesseract.js itself thereafter). Checked against
  qkit's actual CSP (`next.config.ts`): `script-src`/`connect-src` are
  locked to `'self'` + Supabase + Google, no third-party CDN allowed today
  — self-hosting needs zero CSP change, whereas the default CDN mode would
  need loosening it. Also keeps the whole thing same-origin: the
  screenshot never leaves the browser, and neither does a request to fetch
  the OCR engine itself.
- Extracts a dollar amount + success/fail keywords ("successful", "paid",
  "sent" vs "failed", "declined") from the recognized text, compares the
  amount to `order.total_cents`, shows a small hint badge next to the
  photo: "✓ Looks like $12.50, paid" or "⚠ Couldn't read it, check
  manually."
- No Vercel/Next.js bundling risk (the documented failures are
  server-bundling-specific, see Research above) — no spike needed before
  building this, unlike the earlier assessment.

## Scope

**In scope (this spec, qkit only):**

- Payment-first customer checkout flow.
- Vendor board visibility gated on payment claim (QR orders only).
- Async proof-of-payment (screenshot upload, vendor reviews on their own
  time, no more physical show-your-screen) plus a client-side OCR hint on
  that review.
- Self-checkout pickup kiosk: a public, unattended `/order/{boothId}/pickup`
  page + Bluetooth HID barcode scanner, customer scans their own cup to
  mark it collected. Existing one-tap "Mark Picked Up" stays as fallback.

**Out of scope (separate spec/PR, different repo):**

- printkit's label template gaining QR-rendering support (see
  "Cross-repo dependency" below).
- Any real payment-gateway webhook integration (against paykit's own rules).
- Shelf-slot software tracking — the shelf is a physical numbered rack
  matching the existing display number; no new data model for it.
- Renaming printkit to reflect a broader hardware-bridge role — this
  feature needs zero printkit change beyond QR rendering (no input/scanner
  work), so there's no second job-type to motivate a rename yet. Revisit
  only if/when printkit actually gains a non-print job type.

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

The order-status page itself:

- If a customer lands there while `payment_status === "pending"`
  (bookmarked link, browser back button, an abandoned `/pay` visit) it
  **redirects to `/pay`** rather than rendering anything payment-related
  inline. This means `PayPanel` on this page can drop its QR-rendering
  branch entirely — it only ever needs the `claimed` ("waiting for the
  stall to confirm") / `confirmed` / `not_required` display states, since
  `pending` is now unreachable here by construction.
- Gets no new pickup UI — collection is entirely kiosk-side now. The
  page's only real change from today is this redirect guard plus the new
  `/pay` branch above; a `not_required` order's flow is unchanged.

## Vendor flow

- **Board visibility** (`use-realtime-orders.ts` query + realtime filter):
  excludes `payment_status = 'pending' AND source = 'qr'` — **QR/customer
  orders only.** A vendor never sees a customer-placed order until the
  customer has at least claimed payment (or it's `not_required`). Walk-up
  orders (`source = 'walkup'`, `placeWalkupOrder`'s existing `paid` param)
  are unaffected regardless of `payment_status` — staff already handles
  that transaction face-to-face at creation time (cash or PayNow shown
  directly to them), so there's nothing to hide: the whole reason this
  gate exists (an absent, unverifiable customer) doesn't apply to an order
  staff just personally entered.
- **`order-card.tsx`**, `claimed` orders: shows the uploaded proof-photo
  thumbnail (tap to enlarge via a signed URL, minted on demand — never
  embedded pre-signed in the realtime payload, since signed URLs expire)
  next to the existing "Confirm payment" button. Enlarging the photo is
  also where the OCR hint (see above) renders once loaded. The vendor
  reviews asynchronously, at their own time, never needing the customer
  physically present.
- Existing one-tap "Mark Picked Up" (F3, `ADVANCE.ready`) is untouched —
  the fallback for a dead/unpaired scanner or a vendor who hasn't turned
  the kiosk capability on. No vendor-facing scan UI is added to
  `/dashboard` itself — the scan station is the public kiosk page, not a
  dashboard page (see Pickup mechanic).
- A small toggle in dashboard settings for `pickup_scan_enabled`, next to
  the existing board-settings switches.

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
- **`confirmCollection(boothId, orderNumber, token)`** (new action, new
  file `[orderNumber]/collect-actions.ts`, mirroring `payment-actions.ts`'s
  own shape): **anonymous, service-client-based** — back to this shape
  from v1, not v2's vendor-authenticated version, since the kiosk page has
  no login. Verifies the order the same way every other customer action
  does (`booth_id`+`order_number`+`access_token`), checks current
  `status === "ready"` (else a clear "Not ready yet" / "Already collected"
  result, never a hard error — matching this file's existing idempotent
  style; a generic reuse of `advanceOrder`'s logic would instead silently
  advance a `preparing` order to `ready`, which is wrong here), applies the
  same `buildAdvancePatch("completed", now, payment_status)` from
  `src/lib/orders.ts` that `advanceOrder` uses (see Consistency
  verification), and calls `recordOrderStatusEvent({ order_id,
from_status: "ready", to_status: "completed", actor: null })` — `actor`
  is a nullable FK (`order_status_events.actor uuid references
auth.users(id)`, migration 0078), already designed for a non-vendor-
  authenticated write. Rate-limited the same way as `claimPayment`.
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
- **No RLS gap.** `confirmCollection` runs on the service-role client, the
  same boundary already established for `claimPayment`/`unclaimPayment`
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

1. qkit sends a new payload field (e.g. `collect_url`, the same
   `/order/{boothId}/{orderNumber}?t=token` string), only when the booth's
   `pickup_scan_enabled` is on.
2. printkit's own label template needs to render a payload field as a QR
   code — it doesn't today. This is printkit-repo work, tracked as a
   dependency of this feature, not built as part of this qkit spec. No
   scanner-reading/input work is needed on printkit's side (see Pickup
   mechanic) — only QR rendering on the print side.

## Error handling & edge cases

- Upload failure at claim time → claim rejected, customer told to retry;
  never flips to `claimed` without a stored proof path.
- `confirmCollection` called on a non-`ready` order (already completed,
  still preparing, double-scan, or a garbled/unparseable scan) →
  idempotent-friendly message on the kiosk page, no crash; matches this
  file's existing style (`claimPayment`'s already-claimed handling).
- No scanner connected / `pickup_scan_enabled` off → the kiosk page just
  isn't set up at the booth; staff use the existing board fallback.
- The kiosk page's input loses focus (someone taps elsewhere on the
  tablet) → re-focus on blur, otherwise a scan silently types into
  nothing.
- Walk-up orders: unaffected by this mechanic either way — a printed label
  works the same regardless of `source`. Closes the backlog's own open
  question about walk-up participation.

## Testing

- `use-realtime-orders`/board query: excludes `pending`-payment `qr`-source
  orders; a `pending`-payment `walkup` order still appears.
- `claimPayment`: rejects a claim with no/failed photo upload.
- `confirmCollection`: ready→completed happy path, `actor: null` event
  logged, payment auto-confirm reused correctly, non-ready/already-
  completed idempotent responses, rate-limit enforcement, invalid
  booth/order/token rejected (same shape as every other customer action's
  test suite).
- Storage: private bucket has no anon/public read policy
  (`supabase/tests/rls.test.sql`).
- `order-card.tsx`: renders proof thumbnail + confirm for `claimed`; OCR
  hint renders after the dynamic import resolves, never blocks Confirm.
- Order-status page: redirects to `/pay` when `pending`; `/pay` itself
  redirects correctly based on `payment_status`.
- Kiosk page (`/order/{boothId}/pickup`): parses a valid scanned URL and
  calls `confirmCollection`; ignores/flags a garbled scan; re-focuses
  after each attempt; shows the right flash message for each outcome.

## Judgment calls made (flagged for override)

- `pickup_scan_enabled` is vendor-level (`board_settings`), not per-booth —
  matches every existing toggle's precedent. A vendor running multiple
  booths with different pickup models would need per-booth granularity
  instead; not built since no vendor has asked for it (YAGNI).
- Photo upload is mandatory on every claim, regardless of checkout type
  (`qr`/`link`/`image`) — one code path, no branching on payment provider.
- True self-checkout (v3) was chosen over the safer, token-free
  vendor-scanned version (v2) per explicit instruction to prioritize
  removing staff from the handoff, accepting the wider label-exposure
  trade-off documented above.
