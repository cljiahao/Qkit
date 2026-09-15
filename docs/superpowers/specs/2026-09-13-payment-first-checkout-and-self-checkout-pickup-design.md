# Payment-first checkout + self-checkout pickup kiosk (design)

Source: Manfred's second AAR feature backlog (`docs/meta/2026-09-10-manfred-second-aar-feature-backlog.md`),
item C (self-checkout pickup verification) and a UX refinement to the
existing payment flow raised in the same design conversation. Item B
(customer queue display) already shipped (PR #144). This spec combines the
payment-flow reorder with item C's pickup mechanic per an explicit decision
to land them together.

**Revision history:**

- v1: customer scans the cup's QR with their own phone camera.
- v2: reversed to staff-scanned, vendor-authenticated `/dashboard/scan`.
- v3: self-checkout kiosk, QR printed on the cup label (printkit dependency).
- v4: QR moved to the customer's order-status page instead of the cup;
  reconciled payment+start button; OCR + duplicate-photo hint.
- **v5 (current):** order numbers are no longer assigned until a customer
  actually claims payment (not at cart checkout) — closes a real gap found
  in a confirmation sweep of the actual `place_order` SQL and the
  `placeOrder` action: today, a vendor's kitchen printer and Telegram alert
  **already** fire immediately for an unpaid order, and a booth without an
  accept-gate would let an unpaid order skip straight into `preparing`.
  Both are fixed here, plus an abandoned-order sweep (30 min) and a full
  pass through every other section for gaps (queue-display leak, wait-
  estimate inflation, `/pay` dead-end states, undo-window preservation,
  kiosk race conditions). See "Order-number deferral" below.
- **v6 (current):** a second, deeper file-by-file sweep (fork-dispatched,
  9 areas, read-only) against the real code found five more concrete
  issues, now fixed: (1) `orderRowSchema.order_number`
  (`src/lib/realtime-orders.ts`) is non-nullable today — left as-is, every
  payment-required order's realtime INSERT would fail schema validation
  and silently never reach the board at all (not a display bug, a total
  drop); (2) the spec's claim that `revertOrderAdvance` already supports
  undoing the reconciled action was wrong — it only restores
  `payment_status` when reverting from `completed`, not from `preparing`;
  (3) `loadCheckoutContext` (`payment-actions.ts`) doesn't select
  `customer_name`, needed for the claim-time `notifyPrintkit` call; (4)
  `qkit.next_order_number` already exists in the schema but is dead code
  with a truncation bug at 5-digit order counts — the new function must
  copy `place_order`'s own corrected inline pattern, not that function;
  (5) the merge condition for "Mark paid & start" should key on order
  state, not `source = 'qr'` — a walk-up order left unpaid at `pending`
  hits the identical reasoning.

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
  displays a QR code, and a scanner at the counter — staff-side hardware —
  reads it. Useful as a reality check (dedicated scanner hardware beats a
  phone camera at a busy counter), but its handoff still requires a staff
  member at the station. The AAR's actual goal was "removing staff from
  the handoff entirely," which points to grocery-store self-checkout
  (customer operates the scanner themselves, unattended) as the closer
  precedent — what this spec builds.
- **Real webhook-verified PayNow** (Stripe PayNow, Rapyd PayNow) exists only
  through registered payment-gateway integrations — out of scope. paykit's
  own rule (`paykit/AGENTS.md:180-181`) explicitly forbids adding "a
  payment-provider SDK, a webhook that moves money, or a real auto-verify
  integration."
- **Checked: no payment type in qkit/paykit auto-clears today.** Verified
  against `payment-actions.ts`: every checkout type (`qr`/`link`/`image`)
  goes through the identical manual claim→confirm honor system, no
  branching by provider anywhere in the code — a direct consequence of
  paykit's rule above. The reconciled review flow below applies uniformly;
  a real "card auto-clears" distinction would require reopening paykit's
  own rule, a separate decision.
- **Tesseract.js in the browser vs. on a Next.js server**: the documented
  Vercel/Next.js build failures
  ([naptha/tesseract.js#868](https://github.com/naptha/tesseract.js/issues/868),
  [Vercel Community thread](https://community.vercel.com/t/tesseract-js-can-no-longer-find-the-wasm-file-on-vercel/6788))
  are specific to bundling it into a **server** route — running it
  client-side only (a WebWorker) sidesteps that path entirely, confirmed
  via tesseract.js's own docs and an independent write-up
  ([Transloadit](https://transloadit.com/devtips/integrating-ocr-in-the-browser-with-tesseract-js/)).
- **Deferred order numbering, general practice**: order-lifecycle
  literature confirms staying in a "pending/unconfirmed" state before
  finalizing is standard e-commerce practice; the specific micro-pattern of
  deferring a sequential order number isn't commonly written about, but
  follows the same logic invoicing systems use to avoid gaps in a
  compliance-sensitive sequence. This spec's design was validated against
  the actual `place_order` SQL rather than general literature (see below).

## Pickup mechanic: self-checkout kiosk

**Why not customer's own phone camera (v1):** clunky at a busy counter —
open camera/browser, focus on a curved cup surface, wait for decode —
compared to a dedicated scanner.

**Why not vendor-authenticated staff scan (v2):** simpler to secure (no
secret needed on a label), but still requires a staff member to walk to a
station and scan every cup — the AAR's own goal was removing staff from
the handoff entirely, not just making their part of it faster.

**Why not a printkit scanner-hardware integration:** unnecessary — a
standard USB/Bluetooth barcode/QR scanner is a **keyboard-emulating (HID)
device**. It types the decoded text plus an Enter keystroke into whatever
has keyboard focus, no driver, no custom pairing protocol — completely
unlike the NIIMBOT label printer, which needs printkit because printers
require real print-command protocol support. A HID scanner needs none of
that, so this stays entirely inside qkit regardless of mechanic.

**Why not print the QR on the cup (v3):** cost (ongoing label printing) and
identity (a QR on a physical cup can be scanned by anyone holding it,
which doesn't verify the scanner is the right customer — the exact mix-up
this feature targets).

**Chosen approach (v4/v5):** the QR lives on the customer's own
**order-status page**, appearing only once `status === "ready"`. It
encodes that page's own existing URL
(`/order/{boothId}/{orderNumber}?t=token`). A new **public, booth-scoped,
unattended** kiosk page, `/order/{boothId}/pickup`, sits open on a tablet
mounted at the pickup shelf with an auto-focused text input — no login.
The vendor pairs a commodity Bluetooth barcode/QR scanner (~SGD 20-30) to
that tablet once (Settings > Bluetooth — iPadOS also auto-suppresses the
on-screen keyboard whenever a physical/BT keyboard is connected). At
pickup, the customer holds up their own phone screen to the kiosk's
scanner — no printed object involved. The scanner reads it and types the
URL + Enter into the page's input automatically. The page parses it, calls
the collection action, flashes a result, clears, and re-focuses. No
scanner connected → the page sits idle; staff use the existing one-tap
"Mark Picked Up" board button as the fallback.

**Kiosk input must lock during processing.** A busy pickup line scanning
two cups in quick succession could have a second scan's keystrokes land
while the first is still mid-request, corrupting the parse (the second
scan's characters appending to leftover text). The input is disabled (not
just visually, actually non-accepting) from the Enter keystroke until the
in-flight `confirmCollection` call resolves, then cleared and re-focused —
never left accepting input while a request is outstanding.

**Kiosk should reject a scan from the wrong booth.** The kiosk page is
booth-scoped by its own URL; before calling `confirmCollection`, it checks
the scanned URL's `boothId` matches its own. A mismatch (a stray scan of a
neighboring stall's QR at a shared event) shows "Wrong stall" rather than
either silently succeeding against a different booth or a confusing
generic error.

**Honest framing: the kiosk is a UX choke point, not an access-control
boundary.** `confirmCollection` is authorized purely by the token in the
scanned URL, identical to every other customer action in this app — the
kiosk's physical-presence requirement is a workflow nicety (this is where
staff put the tablet), not something the server enforces. Anyone who
obtained the token by another means (a photographed screen, a leaked
link) could call the same action from anywhere. This is the same trust
level every other customer link already has, not a new hole introduced by
this feature — stated explicitly here so the design doesn't imply a
stronger guarantee than it provides.

**Outdoor glare is a real, accepted risk.** qkit's actual usage context
(hawker stalls, outdoor events) means scanning a phone screen in bright
sunlight can be harder than indoors — a known limitation of any
scan-the-phone-screen system, not unique to qkit. Not a reason to reverse
the design (the same condition affects every phone-screen QR system
worldwide, and most phones' max brightness is legible even outdoors at
close range); the existing staff one-tap fallback directly covers a scan
that fails for this reason.

**Walk-up orders don't get this mechanic.** They have no customer
phone/order-status link in play (staff-entered, no QR ever sent to a
customer device) — they keep the existing staff one-tap "Mark Picked Up"
as their only path, unchanged. A narrower gap than the earlier
printed-label version could have avoided, accepted since walk-up is
already a smaller, staff-supervised flow.

## OCR hint + duplicate-photo check

Client-side only, self-hosted, non-blocking hint layered on the vendor's
photo review (see Vendor flow) — never replaces the manual review action.

- `"use client"` component, dynamically imported (`next/dynamic`, same
  pattern already used for `PayPanel`/`react-qr-code`) — loads only when
  the vendor opens a claimed order's proof photo.
- **Self-hosted**, not the default CDN-mirror mode: tesseract.js's core/
  worker/`eng.traineddata` ship under `/public/tesseract/`. Checked
  against qkit's actual CSP (`next.config.ts`): `script-src`/`connect-src`
  are locked to `'self'` + Supabase + Google, no third-party CDN allowed —
  self-hosting needs zero CSP change, and keeps the screenshot (and the
  OCR engine's own asset fetch) fully same-origin.
- Extracts a dollar amount + success/fail keywords, compares the amount to
  `order.total_cents` (this doubles as the "cross-check against the
  pregenerated PayNow price" check), shows a hint badge: "✓ Looks like
  $12.50, paid" or "⚠ Couldn't read it, check manually."
- **Duplicate-photo check, a different technique, not OCR:** at upload
  time, compute a hash of the proof image (e.g. SHA-256 of the file bytes)
  and store it (`orders.payment_proof_hash`). When the vendor opens a
  photo, check whether that hash already exists on a different order for
  the same vendor; if so, flag "⚠ This photo was already used for order
  #031."
- **Known limitation, accepted:** an exact byte hash only catches
  literally re-uploading the same image file — it won't catch a
  re-screenshot of the same real payment (different file bytes, same
  transaction), and it can't distinguish a legitimate repeat purchase
  (same amount, different real payment) from fraud. A perceptual hash
  would close some of this gap but adds real complexity; not worth it
  given a human vendor always makes the final call regardless — this
  stays a cheap hint, not a gate.
- No Vercel/Next.js bundling risk (client-side only, see Research) — no
  spike needed before building this.

## Scope

**In scope (this spec, qkit only):**

- Payment-first customer checkout flow, with order numbers deferred until
  claim (see "Order-number deferral").
- Vendor board visibility gated on payment claim (QR orders only).
- Async proof-of-payment (screenshot upload, vendor reviews on their own
  time) plus a client-side OCR hint and duplicate-photo check.
- Reconciled vendor review action: "Confirm payment" + "Start now" merge
  into one button.
- Abandoned-payment cleanup: auto-cancel a QR order still `pending`
  payment 30 minutes after creation.
- Self-checkout pickup kiosk: public, unattended `/order/{boothId}/pickup`
  page + Bluetooth HID barcode scanner, scanning the QR on the customer's
  own order-status page. Existing one-tap "Mark Picked Up" stays as
  fallback.

**Out of scope:**

- Any real payment-gateway webhook integration, or a per-provider
  auto-clear distinction (against paykit's own rules).
- Shelf-slot software tracking — the shelf is a physical numbered rack
  matching the existing display number; no new data model for it.
- Perceptual/fuzzy image-similarity hashing (see OCR hint's accepted
  limitation).
- No printkit involvement at all, for anything, in this spec.

## Order-number deferral (new in v5)

**What's broken today, verified against the actual code:** `place_order`
(SQL, migration 0086) increments `booths.order_seq` and assigns
`order_number` unconditionally, before payment status is known. Two real
consequences, both already true in production today, independent of this
feature:

1. `place_order`'s own status computation
   (`status = CASE WHEN v_needs_accept THEN 'pending' ELSE 'preparing' END`)
   is computed without regard to payment — a booth that doesn't require an
   accept gate (print disabled, no arrival confirm) inserts a
   payment-required order **directly into `preparing`**, before any
   payment signal exists.
2. `o/[code]/actions.ts`'s `placeOrder` fires `notifyVendorTelegram`
   ("New order #X") and `notifyPrintkit` (**prints a physical kitchen
   ticket**, if the vendor has a label printer on) unconditionally, right
   after the RPC returns — meaning an unpaid order already gets a real
   kitchen ticket printed today.

**Fix:**

- `place_order`: when the order requires payment (`v_expects_payment`),
  skip the `order_seq` increment entirely, insert with `order_number =
NULL` (column becomes nullable), and force `status = 'pending'`
  regardless of `v_needs_accept` — a payment-required order never
  auto-starts. `not_required` and walk-up orders (`place_walkup_order`,
  unaffected by this whole feature) keep today's behavior exactly.
- A new small SECURITY DEFINER function (e.g.
  `qkit.assign_order_number(p_order_id uuid) returns text`), mirroring
  `place_order`'s own atomic `UPDATE booths SET order_seq = order_seq + 1
... RETURNING` pattern, then `UPDATE orders SET order_number = ... WHERE
  id = p_order_id AND order_number IS NULL RETURNING order_number` — the
  `IS NULL` guard makes it idempotent against a retried/concurrent call
  (returns the already-assigned number instead of incrementing twice).
  **Must copy `place_order`'s own zero-pad formatting exactly**
  (`lpad(v_seq::text, greatest(4, length(v_seq::text)), '0')`), **not**
  `qkit.next_order_number` — that function already exists in this schema
  (migration `0008_atomic_order_numbers.sql`), is unused dead code, and
  has a real truncation bug: its `lpad(v_seq::text, 4, '0')` silently
  chops the leading digit once a booth passes 9999 orders (Postgres's
  `lpad` truncates a too-long input from the left). `place_order` and
  `place_walkup_order` already independently inline the corrected version
  and never call it — found in this sweep, worth a one-line note in the
  migration so nobody reaches for `next_order_number` by mistake later,
  but its own fix is out of scope here.
- `claimPayment` calls this function as part of the same successful-claim
  flow, **then** fires `notifyVendorTelegram` and `notifyPrintkit` itself
  (moved here from `placeOrder`, for the payment-required case only) — the
  vendor's first signal that this order exists at all, including the
  kitchen ticket, now genuinely coincides with the customer having claimed
  payment, closing gap 2 above.
- `o/[code]/actions.ts`: the RPC's return schema changes `order_number:
z.string()` → `z.string().nullable()`. `notifyVendorTelegram`/
  `notifyPrintkit` are only called here when `order_number` is non-null
  (`not_required`/free orders, unaffected by any of this). The action's
  own returned `orderNumber` becomes nullable — null is the signal to
  redirect to `/pay` (a single source of truth, rather than checking
  `payment_status` separately).
- `/pay`'s own route can't be order-number-scoped (doesn't exist yet):
  `/order/{boothId}/pay?t=token`, keyed by token/order id, not order
  number. Once claimed, redirect to the now-numbered
  `/order/{boothId}/{orderNumber}?t=token}` as today.

## Abandoned-payment cleanup (new in v5)

A QR order still `payment_status = 'pending'` 30 minutes after creation is
auto-cancelled. Checked how the existing analogous mechanic works:
`sweepReadyOrders` (auto-clearing forgotten `ready` orders) is **not** a
cron job — there's no Vercel Cron configured in this repo at all — it's
polled from the vendor's own open dashboard tab
(`realtime-order-board.tsx`). A new `sweepAbandonedPayments()` action
mirrors this exact pattern: polled the same way, cancels any
`payment_status = 'pending' AND source = 'qr' AND created_at < now() -
interval '30 minutes'` order for the vendor's own booths. Since these
orders never got an `order_number` (per the deferral above), cancelling
one wastes nothing — not even a skipped number. `STUCK_THRESHOLD_MS` in
`src/lib/stuck-orders.ts` already uses the same 30-minute value for a
different purpose (flagging stuck kitchen-status orders); reusing the
value here is a coincidence worth noting, not a shared constant to couple
these two unrelated mechanics to.

## Data model changes

New migration (next number, `0087_...sql`, written to
`supabase/migrations/` — applied by you via the SQL editor per usual, never
run directly):

- `orders.order_number` becomes **nullable** (drops the `NOT NULL` set in
  the original schema, migration `0001_initial_schema.sql`) — null until a
  payment-required order is claimed (see Order-number deferral). The
  existing `UNIQUE (booth_id, order_number)` constraint (same migration)
  needs no change: Postgres treats every `NULL` in a unique constraint as
  distinct from every other `NULL`, so any number of simultaneous
  unclaimed orders at one booth (all `order_number = NULL`) can coexist
  without a conflict — confirmed, not assumed, since this is a real
  gotcha in some other databases.
- **App-layer ripple from the above, both required or the board silently
  breaks:** `src/lib/types.ts`'s `orders` `Row`/`Insert`/`Update` types
  change `order_number: string` → `string | null`. More importantly,
  `src/lib/realtime-orders.ts`'s `orderRowSchema` (`order_number:
z.string()`) must become `z.string().nullable()` — this schema gates
  `parseRealtimeOrderEvent`, which validates every realtime INSERT/UPDATE
  before the board sees it. Left non-nullable, every payment-required
  order's realtime event fails validation and is **silently dropped** —
  not a display glitch, the vendor never learns the order exists via
  realtime at all (only an eventual manual resync would catch it). Found
  in the deep sweep; without this fix the whole feature would appear to
  work in every manual test that happens to trigger a resync, then fail
  silently in real usage.
- `orders.payment_proof_path text null` — storage path of the customer's
  uploaded payment screenshot, in a new **private** bucket `payment-proofs`
  (NOT the existing public `booth-images` bucket — that bucket's adapter
  calls `getPublicUrl`, wrong trust level for a stranger's bank app
  screenshot). No public/anon storage policy; read only via the
  service-role client (a short-lived signed URL minted on demand for the
  vendor's board).
- `orders.payment_proof_hash text null` — a hash of the uploaded proof
  image, computed at upload time. Indexed per-vendor (via a join through
  `booths`) so the duplicate-photo check is a cheap lookup, not a full
  scan.
- `vendors.board_settings` (JSONB, `boardSettingsSchema` in
  `src/lib/schemas.ts`) gains `pickup_scan_enabled: z.boolean().default(false)`
  — opt-in, unlike `customer_telegram_notify_enabled`'s default-true (that
  flag preserved existing behavior; this one introduces new behavior a
  vendor must choose, including buying a scanner and setting up the kiosk
  tablet).
- `qkit.assign_order_number(uuid) returns text` — new SECURITY DEFINER
  function (see Order-number deferral).

No new table. No change to `orders.status`'s state machine (`pending` →
`preparing` → `ready` → `completed`/`cancelled`, `ADVANCE` map in
`src/lib/orders.ts`) beyond forcing `pending` at creation for a
payment-required order — collection still lands on the existing
`completed` status via the existing `buildAdvancePatch("completed", …)`,
just reached by a new caller.

## Customer flow

```
placeOrder creates the order (access_token always assigned; order_number
only if payment is NOT required — see Order-number deferral)
        │
        ├─ payment required?
        │     └─ YES → redirect to NEW page
        │              /order/{boothId}/pay?t=token   (no order number
        │              in the path — doesn't exist yet)
        │              (payment-only: amount, QR/link/image, "I've paid" +
        │               required proof-photo upload — no order number, no
        │               items shown yet, matching the QSR "pay before you
        │               get a number" pattern)
        │              on successful claim (photo uploaded + order_number
        │              assigned) → redirect to
        │              /order/{boothId}/{orderNumber}?t=token
        │
        └─ NO → straight to /order/{boothId}/{orderNumber}?t=token
                 (today's page, unchanged entry point)
```

`/pay` itself handles every state a returning visit could find:

- `payment_status === "pending"` (the normal case) → shows the form.
- Already `claimed`/`confirmed` (browser back button after already
  paying) → redirects **forward** to the now-numbered order-status page,
  rather than re-showing the payment form.
- `order.status === "cancelled"` (the 30-minute sweep beat them to it, or
  a vendor/admin cancellation) → a clear "This order was cancelled" state,
  not a broken payment form with no order to pay for.
- `checkout` failed to load from paykit (network issue, paykit down) → an
  explicit "Couldn't load payment right now — refresh, or ask the stall"
  state with a retry action. **This is a real gap in today's `PayPanel`**:
  when `checkout` degrades to `null`, none of its render branches
  (`qr`/`image`/`link`) show anything, yet the "I've paid" button still
  renders — a customer would see an amount and a working-looking claim
  button with no visible way to actually pay. Worth fixing regardless of
  this feature, and now load-bearing since `/pay` is the customer's only
  path forward.

The order-status page itself:

- If a customer lands there while `payment_status === "pending"`
  (shouldn't be reachable now that `/pay` is order-number-less, but
  possible via a stale bookmark from before this shipped) redirects to
  `/pay` rather than rendering anything payment-related inline. `PayPanel`
  on this page drops its QR-rendering branch entirely — it only ever needs
  the `claimed`/`confirmed`/`not_required` display states now.
- New: when `status === "ready"` AND the booth's vendor has
  `pickup_scan_enabled`, the page shows a QR code encoding its own URL —
  "Show this at the pickup counter to collect." The only new
  customer-facing UI this spec adds; everything else about the page is
  unchanged. Without the toggle on, the page behaves exactly as today.

## Vendor flow

- **Board visibility**: excludes a QR order with `payment_status =
'pending'`. Checked `use-realtime-orders.ts`: Supabase realtime's
  `filter` only supports a single-column condition
  (`booth_id=in.(...)`) — there's no way to express this exclusion as a
  realtime subscription filter, and it doesn't need to be one. This was
  never a security boundary (the vendor is already RLS-authorized to read
  their own orders' full data regardless of payment status) — it's a
  render-level workflow filter. Exact insertion point, confirmed:
  `realtime-order-board.tsx`'s board-list filter predicate (currently
  `!isTerminal(o.status) || undoWindowIds.has(o.id)`) — add `&&
!(o.payment_status === "pending" && o.source === "qr")` to the same
  predicate. `orderRowSchema` already carries both fields through, so no
  new data needs to flow anywhere for this to work. Walk-up orders
  (`source = 'walkup'`) are unaffected regardless of `payment_status` —
  staff already handles that transaction face-to-face at creation, so
  there's nothing to hide.
- **Two other surfaces read active orders and need the exact same
  exclusion, found in this sweep — exact lines confirmed:**
  - `getBoothQueueDisplay` (`display/actions.ts:99-100`, PR #144's public
    TV display): `.select("order_number, status, created_at,
priority_bumped_at")`, no payment filter. Without this fix, an unpaid QR
    order would show as a "Preparing" tile on the **public** screen while
    remaining invisible on the vendor's own board.
  - `getWaitEstimate` (`status-actions.ts:155-156`)'s `active` query:
    `.select("id, status, created_at, priority_bumped_at")`, same gap — a
    pile of never-claimed QR orders would inflate every other customer's
    "orders ahead of you."
  - Fix for both: filter via `.eq()`/exclusion on `payment_status`/`source`
    **without adding those columns to the select list** — both queries
    are deliberately narrow, least-privilege row shapes already
    (documented in the queue-display code); filtering without selecting
    preserves that intent instead of widening a public-facing query's own
    row shape just to filter on it.
- **`order-card.tsx`, reconciled review action:** today, a payment-required
  order at `status === "pending"` shows two separate taps — "Mark as
  paid"/"Confirm payment received" (`confirmOrderPayment`) and a second
  "Start now" button (`advanceOrder`) — verified against the actual
  current UI (`order-card.tsx:565-587`). They merge into one button ("Mark
  paid & start", exact copy TBD in the plan) whenever `status ===
"pending"` AND `payment_status` isn't `confirmed`/`not_required` —
  **keyed on order state, not `source`**: a walk-up order staff left
  unpaid at creation (`paid: false`) hits the identical "why would you
  confirm payment without also starting" reasoning, so it gets the merged
  button too, not just QR orders. Shows the proof-photo thumbnail (signed
  URL, minted on demand) plus the OCR + duplicate-photo hints once opened,
  then performs both the payment confirm and the pending→preparing
  advance in one action.
  **Undo needs its own revert path, not a reuse of `revertOrderAdvance`.**
  The v5 draft claimed that function already restores `payment_status` on
  a revert — checked its actual condition
  (`order-actions.ts:160-224`): it only does so when `revertFrom ===
"completed"` (the ready→completed auto-confirm case), not `"preparing"`.
  Reusing it as-is for this undo would silently leave `payment_status`
  stuck at `confirmed` after reverting `status` back to `pending` — a real
  bug if left as originally claimed. Fix: a small dedicated revert
  function for this one case (`revertPaymentAndStart(orderId, ...)`)
  rather than widening `revertOrderAdvance`'s condition, which would
  conflate two different semantic cases in one function. Rejecting a
  bad/fraudulent claim still uses the existing Cancel action.
- Existing one-tap "Mark Picked Up" is untouched — the fallback for a
  dead/unpaired scanner or a vendor who hasn't turned the kiosk capability
  on.
- A small toggle in dashboard settings for `pickup_scan_enabled`.

## New/changed server actions

- **`claimPayment`** (`payment-actions.ts`): requires an uploaded photo.
  **Order of operations matters**: upload the photo first (private
  `payment-proofs` bucket, service client — the existing client-side
  `ImageUploader` path assumes a public bucket, so this can't reuse it)
  and compute `payment_proof_hash`, **then** call paykit's claim, **then**
  assign the order number (`qkit.assign_order_number`) and fire
  `notifyVendorTelegram`/`notifyPrintkit`, **then** the local mirror
  update. This ordering means a failed upload never touches
  `payment_status` at all (no half-claimed state), and a failed paykit
  claim leaves only a harmless orphaned photo in storage — never a
  `payment_status = 'claimed'` order with no photo, and never an assigned
  order number for a claim that didn't actually succeed. Reuses
  `rateLimit`/`clientIp` and `image-resize.ts`. **`loadCheckoutContext`'s
  own select needs `customer_name` added** — checked its current select
  (`payment-actions.ts:66`, `"id, total_cents, payment_status, status"`)
  and confirmed it doesn't fetch it today; `notifyPrintkit` needs it for
  the label content and there's no other cheap source for it in this
  function's existing reads.
- **`confirmPaymentAndStart(orderId)`** (new action, `order-actions.ts`,
  vendor-authenticated like `advanceOrder`/`confirmOrderPayment`): wraps
  the same underlying writes those two already make (`payment_status` →
  `confirmed`, `status` `pending` → `preparing`) as one atomic update.
  Only valid when `status === "pending"` and `payment_status` isn't
  `confirmed`/`not_required` (any source, including a still-unpaid
  walk-up order — see Vendor flow); existing actions remain as-is for
  every other transition. Paired with a new
  **`revertPaymentAndStart(orderId, prevPaymentStatus)`** for its own undo
  window — a dedicated function, not a reuse of `revertOrderAdvance` (see
  Vendor flow for why that would silently corrupt `payment_status`).
- **`sweepAbandonedPayments()`** (new action, `order-actions.ts`): cancels
  a vendor's own `pending`-payment `qr`-source orders older than 30
  minutes. Polled from `realtime-order-board.tsx` via its own separate
  `usePolling` call, **not** batched into the existing `sweepReadyOrders`
  poll and **not** gated behind a vendor setting the way that one is —
  checked the existing poll's condition
  (`realtime-order-board.tsx:470-475`, `enabled: boardSettings.
ready_auto_clear_min != null`) and confirmed it only runs when a vendor
  has opted into auto-clearing ready orders. Abandoned-payment cleanup
  isn't an opt-in preference, it's baseline hygiene, so it runs
  unconditionally on its own interval instead.
- **`confirmCollection(boothId, orderNumber, token)`** (new action, new
  file `[orderNumber]/collect-actions.ts`): anonymous, service-client-
  based, since the kiosk page has no login. Verifies the order the same
  way every other customer action does, checks `status === "ready"` (else
  a clear "Not ready yet" / "Already collected" result — a generic reuse
  of `advanceOrder`'s logic would instead silently advance a `preparing`
  order to `ready`, wrong here), applies the same
  `buildAdvancePatch("completed", now, payment_status)` `advanceOrder`
  uses, and calls `recordOrderStatusEvent({ ..., actor: null })` (a
  nullable FK, already designed for a non-vendor-authenticated write).
  Rate-limited the same way as `claimPayment`.
- **A signed-URL action** for the vendor board to fetch a proof photo on
  demand (short expiry, vendor-session-gated, not service-role).

## Consistency verification

- **Payment auto-confirm on completion is intentional, already shared
  behavior.** `buildAdvancePatch("completed", …)` already auto-confirms a
  `pending`/`claimed` payment on completion — this already happens today
  when a vendor taps "Mark Picked Up" without having explicitly confirmed
  payment. `confirmCollection` reusing the same logic doesn't introduce a
  new fraud surface: a `ready` order can only exist because the vendor
  already saw it and its proof photo on the board (visibility itself
  gates on `claimed`), so payment is already at least `claimed` by the
  time collection is possible.
- **No RLS gap.** `confirmCollection` runs on the service-role client,
  the same boundary already established for `claimPayment`/`unclaimPayment`.
- **The "accepted gap" from the earlier draft is now actually fixed**, not
  just accepted: an abandoned unpaid order used to sit invisible forever
  with no cleanup path; the 30-minute sweep above closes it.

## Testing

- `place_order` (pgTAP): payment-required order inserts with
  `order_number IS NULL` and `status = 'pending'` even when the booth
  doesn't require an accept gate; `not_required`/walk-up orders unaffected.
- `qkit.assign_order_number`: assigns once, idempotent on a second call
  for the same order (returns the same number, doesn't double-increment
  `order_seq`).
- `claimPayment`: rejects a claim with no/failed photo upload before
  touching payment state; assigns the order number and fires the vendor
  Telegram/printkit calls only on a successful claim.
- `sweepAbandonedPayments`: cancels a `pending`-payment `qr` order past 30
  minutes; leaves a `walkup`/`not_required`/already-claimed order alone.
- Board query / `getBoothQueueDisplay` / `getWaitEstimate`: all three
  exclude `pending`-payment `qr`-source orders; a `pending`-payment
  `walkup` order still appears on the board.
- `orderRowSchema`/realtime: a payment-required order's INSERT event (null
  `order_number`) parses successfully and reaches the board — the
  regression test for the schema bug found in this sweep.
- `order-card.tsx`: merged "Mark paid & start" button for the
  pending/unconfirmed-payment case regardless of `source` (walk-up
  included); existing separate buttons for every later transition; undo
  (`revertPaymentAndStart`) reverts both payment and status together.
- `/pay`: shows the form when `pending`; redirects forward when already
  claimed/confirmed; shows a cancelled state; shows a load-failure state
  when `checkout` is null.
- Order-status page: redirects to `/pay` on a stale `pending` visit; shows
  the pickup QR only when `ready` AND `pickup_scan_enabled`.
- Kiosk page: parses a valid scanned URL and calls `confirmCollection`;
  rejects a scan for a different booth with a clear message; locks its
  input during an in-flight request so a rapid second scan can't
  interleave; re-focuses after each attempt.

## Judgment calls made (flagged for override)

- `pickup_scan_enabled` is vendor-level, not per-booth — matches every
  existing toggle's precedent; not built more granularly since no vendor
  has asked for it (YAGNI).
- Photo upload is mandatory on every claim regardless of checkout type —
  one code path, no branching on payment provider.
- True self-checkout was chosen over a safer, vendor-scanned version per
  explicit instruction to prioritize removing staff from the handoff.
- The pickup QR lives on the customer's order-status page, not a printed
  cup label — removes printing cost and the printkit dependency, binds
  the scan to the actual customer's device. Walk-up orders lose the
  mechanic entirely as a result — accepted as a smaller gap than the
  mix-up problem this feature targets.
- Duplicate-photo detection stays a cheap exact hash, not a perceptual
  one — a human vendor is always the real backstop, so the extra
  complexity isn't worth the marginal fraud-catching improvement.
- 30-minute abandoned-payment threshold reuses the value already used by
  `stuck-orders.ts` for an unrelated purpose — a coincidence, not a shared
  constant.
- The reconciled "Mark paid & start" merge condition is keyed on order
  state (`status === "pending"` + payment not confirmed), not on
  `source === "qr"` — a walk-up order left unpaid gets the same merged
  button, since the underlying reasoning doesn't depend on how the order
  was placed.
- `qkit.next_order_number` (existing, unused, buggy past 9999 orders) is
  left alone — fixing or removing it is a separate cleanup, out of scope
  here; the new `assign_order_number` function simply doesn't call it.
