# lib

## Purpose

Framework-agnostic business logic and the Supabase client factories, each paired with its own `*.test.ts`.

## Contents

- `action-result.ts`
- `admin-stats.test.ts`
- `admin-stats.ts`
- `admin-vendor-health.test.ts`
- `admin-vendor-health.ts`
- `admin.test.ts`
- `admin.ts`
- `booth-access.test.ts`
- `booth-access.ts`
- `booth-code.test.ts`
- `booth-code.ts`
- `booth-color.test.ts`
- `booth-color.ts`
- `booth-images.test.ts`
- `booth-images.ts`
- `brand-icon.tsx`
- `carousel.test.ts`
- `carousel.ts`
- `cart-storage.test.ts`
- `cart-storage.ts`
- `cart.test.ts`
- `cart.ts`
- `env.ts`
- `events.test.ts`
- `events.ts`
- `hours-editor.test.ts`
- `hours-editor.ts`
- `hours.test.ts`
- `hours.ts`
- `image-resize.ts`
- `merqo-downgrade-request.test.ts`
- `merqo-downgrade-request.ts`
- `merqo-metrics.test.ts`
- `merqo-metrics.ts`
- `merqo-upgrade-request.test.ts`
- `merqo-upgrade-request.ts`
- `merqo-vendor-status.test.ts`
- `merqo-vendor-status.ts`
- `nps.test.ts`
- `nps.ts`
- `order-alerts.test.ts`
- `order-alerts.ts`
- `orders.test.ts`
- `orders.ts`
- `payments/`
- `plan.test.ts`
- `plan.ts`
- `pricing.ts`
- `rate-limit.test.ts`
- `rate-limit.ts`
- `realtime-orders.test.ts`
- `realtime-orders.ts`
- `recent-orders.test.ts`
- `recent-orders.ts`
- `reorder-handoff.test.ts`
- `reorder-handoff.ts`
- `reorder.test.ts`
- `reorder.ts`
- `reviews.test.ts`
- `reviews.ts`
- `sales-summary.test.ts`
- `sales-summary.ts`
- `schemas.test.ts`
- `schemas.ts`
- `stats.test.ts`
- `stats.ts`
- `stock.test.ts`
- `stock.ts`
- `supabase/`
- `types.ts`
- `tz.test.ts`
- `tz.ts`
- `utils.test.ts`
- `utils.ts`

## Connectivity

`supabase/` holds the Supabase client factories (browser/server/service-role) everything else in `app/` depends on for data access; `payments/` holds the PayNow/payment-adapter logic. The rest are pure business-logic modules — order/booth/entitlement rules, stats aggregation, and shared Zod schemas (`schemas.ts`) used at every server-action/form boundary.

## Parent

[src](../README.md)
