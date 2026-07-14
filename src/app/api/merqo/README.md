# merqo

## Purpose

Endpoints the sibling Merqo product calls into: usage metrics reporting, vendor status lookup, and plan upgrade/downgrade requests. All four are machine-to-machine (no user session) and share the same auth scheme.

## Contents

- `downgrade-request/` — `POST` endpoint that resolves a vendor's plan back to `free` by email lookup.
- `metrics/` — `GET` endpoint returning aggregate qkit usage/revenue metrics.
- `upgrade-request/` — `POST` endpoint that files a pending monthly-Pro `purchase_requests` row for a vendor by email lookup.
- `vendor-status/` — `GET` endpoint returning one vendor's current plan/status by email.

## Connectivity

Every route in this folder repeats the same `bearerOk(request)` guard: reads `process.env.MERQO_METRICS_SECRET`, requires an `Authorization: Bearer <secret>` header, and compares it with `node:crypto`'s `timingSafeEqual` (length-gated first) so a mismatch can't be timed byte-by-byte. The three routes keyed by email (`downgrade-request`, `upgrade-request`, `vendor-status`) all call `supabase.auth.admin.listUsers({ perPage: 1000 })` to resolve an email to a vendor id — each has a known limitation (documented inline as a TODO) that only the first 1000 auth users are checked, so vendors beyond that page silently resolve as not-found/inactive. All four use `createServiceClient()` (service-role, bypasses RLS) since this is server-to-server, not vendor-scoped. `downgrade-request`/`upgrade-request` delegate their pure outcome logic to `@/lib/merqo-downgrade-request` (`resolveDowngradeOutcome`) and `@/lib/merqo-upgrade-request` (`resolveUpgradeOutcome`) respectively; `metrics` delegates to `@/lib/merqo-metrics` (`computeMerqoMetrics`); `vendor-status` delegates to `@/lib/merqo-vendor-status` (`resolveVendorStatus`).

## Parent

[api](../README.md)
