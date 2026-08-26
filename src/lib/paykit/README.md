# paykit

## Purpose

Server-only HTTP client for paykit's `/api/v1/*` checkout API — the Merqo
family's shared vendor payment engine (a separate sibling kit; see
`../../../../paykit/AGENTS.md`). qkit no longer renders its own PayNow QR or
tracks payment state locally end-to-end; this is the seam that replaced
`lib/payments/` (deleted in the paykit cutover).

## Contents

- `client.ts` — `upsertVendorConfig(vendorId, config)` (the "quick add
  PayNow" write path — booth-form's payment section calls this instead of
  writing the full config to `booths.payment`), `getVendorConfig(vendorId)`
  (the read-back path — returns the full `paynow`/`pointer` fields, the
  prefill source for `dashboard/booths/[boothId]/page.tsx` re-opening an
  existing booth's Payment section), `createCheckout({vendorId,
amountCents, orderRef})` (idempotent on `orderRef` — safe to call again for
  the same order and get back the same transaction — also the only way to
  look up an order's paykit transaction id, since qkit stores none of its
  own), `claimCheckout(id)` (customer "I've paid"), `unclaimCheckout(id)`
  (customer "Tapped by mistake? Undo" — reverts `claimed` back to `pending`;
  idempotent on `pending`, and paykit itself refuses to revert a `confirmed`
  transaction, echoing that status back unchanged), `confirmCheckout(id)`
  (vendor "Confirm payment"), `getCheckoutStatus(id)` (read-only poll,
  not currently used by qkit's own polling — see its doc comment), and
  `getBookingStatus(bookingId)` (read-only booking status — deposit/balance
  amounts, event date, and whether each is confirmed — for the "booking
  status" section on an event-mode booth's dashboard; the vendor pastes
  their own `paykit_booking_id` into the booth, this never looks a booking
  up by name/phone/date). Every
  function returns a `PaykitResult<T>` (`{ok:true,data}` |
  `{ok:false,status,error}`) and never throws; the shared `paykitRequest`
  helper reads `PAYKIT_KIT_SECRET` at request time (not import time, since
  the production key isn't minted yet — see `.env.example`) and
  bearer-authenticates as `Authorization: Bearer qkit:<secret>`, validating
  every response body against a local Zod schema mirroring paykit's own
  `src/lib/api-schemas.ts` wire contract. Every `vendorId`/`transactionId`
  interpolated into a request path is `encodeURIComponent`'d, so a value
  containing `/`, `?`, or `#` can't add extra path segments or query params
  to the request paykit actually receives.
- `client.test.ts` — tests the missing-secret degrade path (no network call),
  the bearer header/URL shape, response mapping for each endpoint, non-2xx
  error-body surfacing, network-failure handling (never throws), and that
  every path-interpolated id is percent-encoded.

## Connectivity

Called from: `src/app/dashboard/booths/actions.ts` (`saveBooth`, via
`upsertVendorConfig`), `src/app/dashboard/booths/[boothId]/page.tsx` (via
`getVendorConfig`, prefilling the edit form, and `getBookingStatus`,
prefilling `BookingStatusSection`), `src/app/order/[boothId]/
[orderNumber]/page.tsx` and `payment-actions.ts`
(`createCheckout`/`claimCheckout`/`unclaimCheckout`, customer side), and
`src/app/dashboard/order-actions.ts` (`confirmOrderPayment`, vendor side).
`PAYKIT_KIT_SECRET` / `NEXT_PUBLIC_PAYKIT_URL` are the two env vars this
module reads — see `.env.example` for what they must equal on paykit's side.

## Parent

[lib](../README.md)
