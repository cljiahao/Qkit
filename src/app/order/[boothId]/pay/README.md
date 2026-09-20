# pay

## Purpose

Payment-first gate shown before an order has a number: `placeOrder`
(`src/app/o/[code]/actions.ts`) defers assigning `order_number` for any
payment-required order (see migration 0087), so `OrderForm` redirects here
(`/order/{boothId}/pay?t={token}`) instead of to the usual numbered
`[orderNumber]/` status page when `placeOrder` returns a null
`orderNumber`. The customer only reaches a real order number once they
upload proof of payment here, via `claimPayment`
(`../[orderNumber]/payment-actions.ts`, Task 3), which now both requires a
photo and does the deferred numbering.

## Contents

- `page.tsx` — `PayPage` (route entry, `revalidate=0`): validates `boothId`
  as a UUID and `t` (the access token) as present and well-formed
  (`notFound()` otherwise), then calls `loadPreClaimContext(boothId, token)`
  — `notFound()` again on a null result (bad token, an order that's already
  claimed/confirmed, or one that never required payment). Renders `PayForm`
  with the amount and checkout view `loadPreClaimContext` returned.
- `page.dom.test.tsx` — RTL test rendering `PayPage` directly, with
  `PayForm` stubbed (own dedicated test file): the `notFound()` branch for
  an invalid booth id, a missing token, and a null `loadPreClaimContext`
  result, plus that a valid context renders `PayForm` with the right
  amount/token/checkout props.
- `pay-form.tsx` — `PayForm({ boothId, token, amountCents, checkout })`
  client component: renders the same QR/image/link checkout markup as
  `../[orderNumber]/pay-panel.tsx` (amount echo, `react-qr-code` +
  "Save QR image" share/download button for a `qr` checkout via
  `renderSvgToPngBlob`, `../[orderNumber]/qr-image.ts`, an `<img>` with a
  load-failure fallback for `image`, a link button for `link`), plus a
  null-`checkout` branch ("Couldn't load payment right now" with a
  `router.refresh()` button) that `pay-panel.tsx` itself doesn't yet have.
  Below the checkout, a labelled file input (`accept="image/*"
capture="environment"`) downscales the selected photo via `resizeToWebp`
  (`@/lib/image-resize`) before holding it in state. "I've paid" shows an
  inline "A payment screenshot is required." error and never calls the
  action if no photo was selected; otherwise it calls
  `claimPayment(boothId, token, photo)` and, on success, `router.push`es to
  the newly-numbered `../{orderNumber}?t={token}` status page — the moment
  this order first gets a number. A failure shows `res.error` via
  `toast.error` (`sonner`), same convention as `pay-panel.tsx`.
- `pay-form.dom.test.tsx` — RTL tests: the null-checkout load-failure state
  (and its refresh button), the required-photo inline error, a successful
  upload+claim+redirect, a failed claim's toast, QR/link checkout
  rendering, and the "Save QR image" button's Web Share / download-link /
  rasterize-failure paths (same coverage shape as
  `../[orderNumber]/pay-panel.dom.test.tsx`).

Deliberately **not** used here: `unclaimPayment`/`getPaymentStatus`
(`../[orderNumber]/payment-actions.ts`). Both operate on an
already-numbered order (`orderNumber` in their signature) — this page's
whole reason to exist is that the order doesn't have one yet. Once
`claimPayment` succeeds and the customer lands on the numbered
order-status page, `pay-panel.tsx` there is what polls status and offers
the "Tapped by mistake? Undo" unclaim affordance.

## Connectivity

Reached only via `OrderForm`'s redirect (`src/components/order/
order-form.tsx`) when `placeOrder` returns `orderNumber: null`. On a
successful claim, `pay-form.tsx` navigates to `../{orderNumber}/page.tsx`
(the live order-status page), which is where all further payment/order
polling and actions happen — nothing links back to this page once an
order has its number.

## Shared package note

The payment-proof upload's resize step now calls `@merqo/ui`'s `resizeToWebp` (v0.31.0) rather than `@/lib/image-resize`.

## Parent

[[boothId]](../README.md)
