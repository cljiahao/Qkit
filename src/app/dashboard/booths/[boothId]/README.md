# [boothId]

## Purpose

Edit-booth page, keyed by booth id, plus its printable QR code sub-route.

## Contents

- `page.tsx` — `EditBoothPage({ params })` (server, `revalidate = 0`): awaits `boothId` from `params`, loads the booth (`name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm`) RLS-scoped so a foreign id resolves to `null` → `notFound()`, parses stored JSON via `parseMenuItems`/`parseBoothHours`/`parsePaymentConfig`/`parseSocialLinks`, and renders `BoothForm` (from `../booth-form`) pre-filled with the booth's data, passing the vendor's own `social_links` as `vendorSocialLinks` (so the "Social links" section can seed a new override from the vendor's defaults).
- `qr/` — the printable QR-code poster sub-route for this specific booth.

## Connectivity

`page.tsx` is the edit form (the shared `booth-form.tsx` pre-filled with this booth's data, saved via `saveBooth`/`deleteBooth` in `../actions.ts`); `qr/` is the printable QR-code sub-route for this specific booth, linked from `booth-list.tsx`'s QR button.

## Parent

[booths](../README.md)
