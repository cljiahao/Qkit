# qkit Payments Seam — Design

**Date:** 2026-06-28
**Status:** Approved (design); plan + implementation to follow.

## Summary

qkit was born a queueing system with payment optional. This adds a **bring-your-own
payment seam**: a vendor may wire their own payment system (PayNow QR, any payment
link, a static QR image, or — later — a verified Stripe Connect account) so the
queue becomes a _payment queue_. Payment stays **optional**: a booth with no method
configured behaves exactly as today.

### Guiding decisions (locked during brainstorming)

- **Seam, not forced provider.** qkit offers a pluggable payment-method seam; it does
  not force vendors onto a payment system qkit chose.
- **No paycut on BYO.** qkit takes no transaction cut when a vendor wires their own
  payment. This removes the only reason to be a Stripe Connect _platform_, so qkit
  never sits in the money flow → no MAS exposure, no money-flow handling.
  Monetization stays subscription-only (existing free/Pro plans).
- **Stripe platform is blocked anyway.** A Connect platform account requires qkit to
  be a registered business (UEN/ACRA). qkit is not incorporated yet, so the verified
  Stripe adapter is **schema-reserved but dark** in v1. A vendor's own Stripe
  _Payment Link_ is still supported today — as a `pointer`.
- **Order-first, not pay-first.** The order is created immediately (today's behavior
  preserved); payment is tracked alongside as a status. This honors the queue-first
  DNA and keeps payment optional.

### v1 scope

Methods: `none` (today), `pointer` (any link / static QR, incl. Stripe Payment Link),
`paynow` (qkit generates a dynamic PayNow QR per order). `stripe` (verified) is
schema-reserved; its adapter throws "not enabled". No money flow, no qkit Stripe
account, no regulatory exposure.

## Data model

### `booths.payment` — new nullable JSONB (discriminated union by `kind`)

```text
null                                              // queue-only (today)
{ kind:'pointer', label, url?, qr_image_url? }    // any link / uploaded static QR
{ kind:'paynow',  payee_name, uen? | mobile? }    // qkit generates dynamic QR per order
{ kind:'stripe',  account_id }                    // DARK — schema reserved, adapter throws
```

No secrets in any active kind. A PayNow UEN/mobile, a payment link, and a static QR
image are all public-by-design, so `booths.payment` rides the **existing public booth
read** with no stripping and no special handling — consistent with the "no secrets in
client" rule. (`pointer.url` and `paynow` identifiers are intended to be shown to the
paying customer.)

A `pointer` requires at least one of `url` / `qr_image_url`. A `paynow` requires
exactly one of `uen` / `mobile` plus `payee_name`. Validated by Zod at the write
boundary (vendor config form + booth save action) and parsed tolerantly at the read
boundary (malformed → treated as `null`/no method, never crashes the order page).

### `orders` — three new columns

- `payment_status`: `not_required` | `pending` | `claimed` | `confirmed`
  - `not_required` — booth had no payment method at order time.
  - `pending` — method present, customer has not claimed payment yet.
  - `claimed` — customer tapped "I've paid" (unverified claim).
  - `confirmed` — vendor confirmed receipt (or, future `stripe`, webhook → `confirmed`).
- `payment_method_kind`: text — snapshot of the kind used, frozen at order time so
  history is immune to later booth edits.
- `paid_at`: timestamptz — set when `payment_status` becomes `confirmed`.

`placeOrder` sets `payment_status = 'pending'` and snapshots `payment_method_kind`
when the booth has a method; otherwise `not_required`. `order_status` (the existing
prep lifecycle) is unchanged and independent of `payment_status`.

## Connector interface (`src/lib/payments/`)

Adapter pattern, pure functions (mutation-testable per AGENTS.md — lives in `src/lib`).

```ts
type PaymentKind = "pointer" | "paynow" | "stripe";

type CheckoutView =
  | { type: "qr"; payload: string } // paynow EMVCo string → client renders QR
  | { type: "link"; url: string; label: string } // pointer link
  | { type: "image"; url: string }; // pointer static QR image

interface PaymentAdapter {
  kind: PaymentKind;
  renderCheckout(
    config: PaymentConfig,
    ctx: { amountCents: number; orderRef: string },
  ): CheckoutView;
}
```

- `pointer` → returns `link` (with label) or `image`.
- `paynow` → builds an **EMVCo SGQR / PayNow** payload string from the vendor's
  UEN or mobile + the order amount + an order reference; returns `{ type:'qr', payload }`.
  The client renders the QR from the payload (no image stored).
- `stripe` → stub that throws `"stripe payments not enabled"`. Reserved slot; adding a
  verified adapter later does not touch the order flow.

The EMVCo PayNow payload builder is the core pure unit (CRC, length-prefixed TLV
fields, dynamic amount). It is unit- and mutation-tested.

## Flow

1. **Vendor config.** Booth editor gains a "Payments" section: choose a kind and fill
   its config; Zod-validated; saved to `booths.payment`. Static-QR upload reuses the
   existing booth image storage path.
2. **Customer.** `placeOrder` is unchanged (order created → status page). If the booth
   has a method, the status page renders a **Pay panel** from the adapter (QR / link /
   image) plus an **"I've paid"** button → `claimPayment` action → `pending` → `claimed`.
   A booth with no method shows no pay panel (identical to today).
3. **Vendor board.** Each order card shows a payment badge reflecting `payment_status`.
   A `claimed` order shows a **"Confirm received"** button → `confirmPayment` →
   `confirmed` + `paid_at`. (Vendor sees the PayNow notification on their phone, then
   confirms.) Realtime board already subscribes to `orders`; the new fields arrive free.

## RLS / security

- **`booths.payment`** is exposed through the **existing public booth read** — no
  secrets, no policy change, no stripping.
- **`claimPayment`** — the customer is anonymous, so this is a **service-role server
  action** (same pattern as the order status page). It narrowly permits only a
  `pending` → `claimed` transition for the single targeted order; it cannot set
  `confirmed`, cannot touch `order_status`, and ignores any other field.
- **`confirmPayment`** — the vendor is authenticated, so it uses the normal server
  client and relies on the **existing RLS** (a vendor may update only orders whose
  booth belongs to them). No policy is widened. Guards `claimed`/`pending` → `confirmed`.
- A future `stripe` adapter would introduce a webhook + per-vendor secret handling;
  that is out of scope here and must not be back-doored by this work.

## Migration + types

- `supabase/migrations/0024_booth_payments.sql`: add `booths.payment jsonb`; add
  `orders.payment_status`, `orders.payment_method_kind`, `orders.paid_at`. Model
  `payment_status` as a Postgres enum (mirrors the `order_status` enum precedent) or a
  CHECK constraint — enum chosen for parity. Backfill existing orders to `not_required`.
- Update `src/lib/types.ts` (new columns, `payment` config union type, `PaymentStatus`)
  and `src/lib/schemas.ts` (payment-config Zod union for write + tolerant read parser,
  `payment_status` enum). Orders are already in the realtime publication.

## Testing

- **Unit (mutation-tested, `src/lib`)**: EMVCo PayNow payload builder (CRC + TLV +
  amount), adapter selection, payment-config Zod schemas (accept/reject matrix).
- **DOM (`*.dom.test.tsx`)**: vendor payment-config form (kind switch + validation),
  customer Pay panel + "I've paid", vendor "Confirm received" button.
- **RLS (`supabase/tests/rls.test.sql`)**: a customer (anon/service path) can claim but
  cannot confirm; a vendor can confirm only their own booth's orders.
- **E2E (`e2e/customer-order.spec.ts`)**: extend the Kopitiam-cart path — configure a
  PayNow method, place an order, see the generated PayNow QR, tap "I've paid", then
  (vendor) confirm receipt.

## Out of scope (v1)

- Verified Stripe Connect adapter (blocked: no business entity; unneeded: no cut).
- Any transaction cut / application fee / platform money flow.
- Refunds, partial payments, payment reconciliation/ledger for customer→vendor money
  (qkit never holds these funds).
- GrabPay / ShopeePay / Atome / other e-wallets (fall back to `pointer`).
