# payments

## Purpose

Payment-adapter logic for the customer checkout panel. No money ever flows
through qkit — customers pay vendors directly via a PayNow QR, a payment link,
or a static QR image; this folder only renders the right view for whichever
method a vendor has configured (`booths.payment`) and generates a spec-
compliant PayNow QR payload.

## Contents

- `adapters.ts` — `CheckoutView` union (`qr`/`link`/`image`) and
  `renderCheckout(config, {amountCents, orderRef})`: maps a `PaymentConfig`
  (from `@/lib/types`) to what the customer's Pay panel renders — `pointer`
  yields a `link` (if `url` set) or an `image` (if `qr_image_url` set),
  `paynow` yields a `qr` built via `buildPayNowPayload`, and `stripe` (reserved
  but dark) or an unconfigured pointer both yield `null` so the caller shows no
  pay panel rather than throwing.
- `adapters.test.ts` — tests each `renderCheckout` branch: pointer-with-url,
  pointer-with-qr-image, PayNow (payload contains the formatted amount),
  stripe (always null), and a pointer with neither destination (null).
- `paynow.ts` — `crc16(s)` (CRC-16/CCITT-FALSE over UTF-8 bytes, matching what
  a banking-app QR scanner computes) and `buildPayNowPayload({uen, mobile,
payeeName, amountCents, reference})`, which assembles an EMVCo TLV payload
  (merchant template `SG.PAYNOW`, fixed/single-use amount, SGD currency code
  `702`, country `SG`, payee name/city, bill reference) terminated with the
  computed CRC.
- `paynow.test.ts` — tests `crc16` against the official CRC-16/CCITT-FALSE
  check value for `"123456789"` (`0x29B1`), and `buildPayNowPayload` for
  correct amount/UEN encoding, mobile-vs-UEN proxy-type selection (`0` vs
  `2`), and the trailing CRC-tag format.

## Connectivity

Imported by the customer order/checkout UI (the booth "Pay" panel) via
`renderCheckout`, which is fed a `PaymentConfig` parsed by
`@/lib/schemas`'s `parsePaymentConfig` from the booth's `payment` JSONB column.
`adapters.ts` is the only consumer of `paynow.ts` inside this folder.

## Parent

[lib](../README.md)
