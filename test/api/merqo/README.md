# merqo

## Purpose

Tests for the `src/app/api/merqo/` route handlers — the bearer-token-gated
feed that exposes qkit's business metrics to the Merqo umbrella product.

## Contents

- `metrics.test.ts` — tests `GET /api/merqo/metrics`
  (`src/app/api/merqo/metrics/route.ts`). Mocks
  `@/lib/supabase/server`'s `createServiceClient` with a thenable
  query-builder stub. Asserts: 401 when the `Authorization` bearer is
  missing, wrong, or the server's `MERQO_METRICS_SECRET` env var is unset;
  200 with the full metrics contract shape (`revenue_cents_30d`,
  `revenue_cents_all`, `gmv_cents_30d`, `active_vendors`, `orders_7d`,
  `orders_prev_7d`, `signups_7d`, `pro_vendors`, `total_vendors`,
  `pending_upgrade_requests`, and a `funnel` object with
  `signed_up`/`with_booth`/`with_order`/`pro`) on a valid bearer, wired
  through five sequential `.from()` reads (vendors, booths, orders, payments,
  purchase_requests count); and 503 (`{"error":"Upstream unavailable"}`) when
  any of those five reads errors.

## Connectivity

Tests `src/app/api/merqo/metrics/route.ts`, which itself is built on
`@/lib/merqo-metrics.ts`'s `computeMerqoMetrics` (and transitively
`@/lib/admin-stats.ts`). The mocked `createServiceClient` stands in for the
real RLS-bypassing service-role client the route uses to read across all
vendors.

## Parent

[api](../README.md)
