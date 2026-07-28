# merqo

## Purpose

Endpoints the sibling Merqo product calls into: usage metrics reporting, vendor status lookup, plan upgrade/downgrade requests, and vendor push-provisioning. All five are machine-to-machine (no user session).

## Contents

- `downgrade-request/` — `POST` endpoint that resolves a vendor's plan back to `free` by email lookup.
- `metrics/` — `GET` endpoint returning aggregate qkit usage/revenue metrics.
- `upgrade-request/` — `POST` endpoint that files a pending monthly-Pro `purchase_requests` row for a vendor by email lookup.
- `vendor-provision/` — `POST` endpoint that creates a free-tier `vendors` row (and seeds the shared vendor profile) for a vendor id the Merqo hub is one-click-activating on qkit.
- `vendor-status/` — `GET` endpoint returning one vendor's current plan/status by email.

## Connectivity

Four of the five routes (`downgrade-request`, `metrics`, `upgrade-request`, `vendor-status`) repeat the same `bearerOk(request)` guard: reads `process.env.MERQO_METRICS_SECRET`, requires an `Authorization: Bearer <secret>` header, and compares it with `node:crypto`'s `timingSafeEqual` (length-gated first) so a mismatch can't be timed byte-by-byte. `vendor-provision` instead uses `provisionBearerOk(request)` against a separate `MERQO_PROVISION_SECRET` — it's a write capability (creates a real tenant row), so it's deliberately not gated by the same secret as the read-only/reporting routes. The three routes keyed by email (`downgrade-request`, `upgrade-request`, `vendor-status`) all call `supabase.auth.admin.listUsers({ perPage: 1000 })` to resolve an email to a vendor id — each has a known limitation (documented inline as a TODO) that only the first 1000 auth users are checked, so vendors beyond that page silently resolve as not-found/inactive. All five use `createServiceClient()` (service-role, bypasses RLS) since this is server-to-server, not vendor-scoped. `downgrade-request`/`upgrade-request` delegate their pure outcome logic to `@/lib/merqo-downgrade-request` (`resolveDowngradeOutcome`) and `@/lib/merqo-upgrade-request` (`resolveUpgradeOutcome`) respectively; `metrics` delegates to `@/lib/merqo-metrics` (`computeMerqoMetrics`); `vendor-status` delegates to `@/lib/merqo-vendor-status` (`resolveVendorStatus`); `vendor-provision` seeds the shared `merqo.vendor_profile` via `getOrCreateVendorProfile()` (`@/lib/merqo-vendor-profile`).

## Parent

[api](../README.md)
