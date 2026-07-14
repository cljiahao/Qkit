# metrics

## Purpose

Endpoint reporting aggregate qkit usage and revenue metrics to the Merqo product, for a cross-product dashboard/report.

## Contents

- `route.ts` — `GET(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check against `MERQO_METRICS_SECRET`, constant-time compare via `timingSafeEqual`). Fetches `vendors` (id/plan/created_at), `booths` (id/vendor_id), `orders` (booth_id/status/total_cents/created_at), `payments` (amount_cents/created_at), and a `head:true` count of pending `purchase_requests`, all in one `Promise.all`. Passes the results to `computeMerqoMetrics()` (`@/lib/merqo-metrics`) and returns `{ product: "qkit", generated_at, ...metrics }` as JSON. Any read failure short-circuits to a 503.

## Connectivity

Calls `createServiceClient()` (`@/lib/supabase/server`, bypasses RLS — appropriate here since this is a server-to-server report, not vendor-scoped) and delegates all metric computation to the pure function `computeMerqoMetrics()` in `@/lib/merqo-metrics`. Its `bearerOk()` guard is the canonical copy the other three `merqo/` routes describe themselves as copying verbatim.

## Parent

[merqo](../README.md)
