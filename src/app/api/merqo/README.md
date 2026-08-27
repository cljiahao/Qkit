# merqo

## Purpose

Endpoints the sibling Merqo product calls into: usage metrics reporting, vendor status lookup, per-vendor activity detail, plan upgrade/downgrade requests, and vendor push-provisioning. All six are machine-to-machine (no user session).

## Contents

- `downgrade-request/` — `POST` endpoint that resolves a vendor's plan back to `free` by email lookup.
- `metrics/` — `GET` endpoint returning aggregate qkit usage/revenue metrics.
- `upgrade-request/` — `POST` endpoint that files a pending monthly-Pro `purchase_requests` row for a vendor by email lookup.
- `vendor-activity/` — `GET` endpoint returning one vendor's plan, admin-console health status, a handful of labeled metrics, and last-activity timestamp by email — feeds merqo's `/admin/vendors/[email]` detail page.
- `vendor-provision/` — `POST` endpoint that creates a free-tier `vendors` row (and seeds the shared vendor profile) for a vendor id the Merqo hub is one-click-activating on qkit.
- `vendor-status/` — `GET` endpoint returning one vendor's current plan/status by email.

## Connectivity

Five of the six routes (`downgrade-request`, `metrics`, `upgrade-request`, `vendor-activity`, `vendor-status`) import the same `bearerOk(request)` guard from `@/lib/merqo-auth`: it reads `process.env.MERQO_METRICS_SECRET`, requires an `Authorization: Bearer <secret>` header, and compares it with `node:crypto`'s `timingSafeEqual` (length-gated first) so a mismatch can't be timed byte-by-byte. `vendor-provision` instead uses the sibling `provisionBearerOk(request)` (same module) against a separate `MERQO_PROVISION_SECRET` — it's a write capability (creates a real tenant row), so it's deliberately not gated by the same secret as the read-only/reporting routes. The four routes keyed by email (`downgrade-request`, `upgrade-request`, `vendor-activity`, `vendor-status`) all resolve an email to a vendor id via `@/lib/merqo-auth`'s `listAllAuthUsers(supabase, logPrefix)` (a thin wrapper over `supabase.auth.admin.listUsers({ perPage: 1000 })` that logs when a full 1000-user page comes back) plus `findAuthUserByEmail(users, email)` for the case-insensitive match — the known limitation is that only the first 1000 auth users are checked, so vendors beyond that page silently resolve as not-found/inactive. All six use `createServiceClient()` (service-role, bypasses RLS) since this is server-to-server, not vendor-scoped. `downgrade-request`/`upgrade-request` delegate their pure outcome logic to `@/lib/merqo-downgrade-request` (`resolveDowngradeOutcome`) and `@/lib/merqo-upgrade-request` (`resolveUpgradeOutcome`) respectively; `metrics` delegates to `@/lib/merqo-metrics` (`computeMerqoMetrics`); `vendor-activity` delegates to `@/lib/merqo-vendor-activity` (`computeVendorActivity`), which itself reuses `@/lib/admin-vendor-health`'s `buildVendorHealth` for its `status` field rather than re-deriving triage logic; `vendor-status` delegates to `@/lib/merqo-vendor-status` (`resolveVendorStatus`); `vendor-provision` seeds the shared `merqo.vendor_profile` via `getOrCreateVendorProfile()` (`@/lib/merqo-vendor-profile`).

## Parent

[api](../README.md)
