# components

## Purpose

Shared React components used across the dashboard, landing page, and order flow.

## Contents

- `back-button.tsx`
- `back-to-top.tsx`
- `dashboard-tour.dom.test.tsx`
- `dashboard-tour.tsx`
- `featured-booths.dom.test.tsx`
- `featured-booths.tsx`
- `feedback-form.tsx`
- `hero-preview-carousel.dom.test.tsx`
- `hero-preview-carousel.tsx`
- `image-uploader.tsx`
- `item-customizer.tsx`
- `landing-board.dom.test.tsx`
- `landing-board.tsx`
- `landing-boards.ts`
- `landing-cta.tsx`
- `landing-ticket.dom.test.tsx`
- `landing-ticket.tsx`
- `media-image.tsx`
- `order/`
- `order-card.dom.test.tsx`
- `order-card.tsx`
- `order-status-badge.tsx`
- `paginated.tsx`
- `pro-lock.tsx`
- `providers.tsx`
- `reorder-button.tsx`
- `service-worker-registrar.tsx`
- `support-form.tsx`
- `ticket-section.tsx`
- `tour-steps.test.ts`
- `tour-steps.ts`
- `tour.css`
- `ui/`
- `zoomable-image.tsx`

## Connectivity

`ui/` is the shadcn/ui primitive library everything else in this tree is built from; `order/` holds components specific to the customer ordering flow. The rest are shared components used across the dashboard and landing pages — the `landing-*` family renders the marketing page, `ticket-section.tsx` is the bordered "ticket card" shell used by profile/settings/booth-form.

## Parent

[src](../README.md)
