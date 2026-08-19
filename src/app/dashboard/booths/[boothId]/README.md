# [boothId]

## Purpose

Edit-booth page, keyed by booth id, plus its printable QR code sub-route.

## Contents

- `page.tsx` — `EditBoothPage({ params })` (server, `revalidate = 0`): awaits `boothId` from `params`, loads the booth (`name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm, walkup_default`) RLS-scoped so a foreign id resolves to `null` → `notFound()`, parses stored JSON via `parseMenuItems`/`parseBoothHours`/`parseSocialLinks`, and renders `BoothForm` (from `../booth-form`) pre-filled with the booth's data, passing the vendor's own `social_links` as `vendorSocialLinks` (so the "Social links" section can seed a new override from the vendor's defaults). `payment` is built by the local `initialPayment`, which prefers paykit's own record: it calls `getVendorConfig` (`@/lib/paykit/client`) and, when that succeeds and reports `hasConfig`, maps its full `paynow`/`pointer` fields straight into a `PaymentConfig` so re-opening an existing booth's Payment section starts genuinely pre-filled, not just on the right radio option. `initialPaymentFromMarker` is now only the degrade-path fallback (paykit call fails, or reports no config) — it falls back to `booths.payment`'s minimal `{kind}` marker (the full config's source of truth, see `../actions.ts`), seeding just the right radio selection with blank text fields, not `parsePaymentConfig`'s full-shape parse (which would reject a marker missing the required fields and silently fall back to `null`/"none").
- `qr/` — the printable QR-code poster sub-route for this specific booth.

## Connectivity

`page.tsx` is the edit form (the shared `booth-form.tsx` pre-filled with this booth's data, saved via `saveBooth`/`deleteBooth` in `../actions.ts`); `qr/` is the printable QR-code sub-route for this specific booth, linked from `booth-list.tsx`'s QR button.

## Parent

[booths](../README.md)
