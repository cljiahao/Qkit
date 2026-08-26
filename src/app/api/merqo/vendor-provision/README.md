# vendor-provision

## Purpose

Push-provisioning endpoint: Merqo hub calls this to create a free-tier `vendors` row for a vendor who hasn't signed up on qkit directly yet, keyed on their existing (shared) `auth.users.id`. Companion to `vendor-status` (read) — this is the write direction.

## Contents

- `route.ts` — `POST(request)`. Guarded by `provisionBearerOk()` — a DIFFERENT secret (`MERQO_PROVISION_SECRET`) from `vendor-status`/`metrics`'s `MERQO_METRICS_SECRET`, since this is a write capability. Body validated as `{ user_id: string (uuid) }`. Inserts into `vendors` (id only — `plan` defaults to `'free'` at the column level); a `23505` (already exists) is treated as success, not an error. On first creation, also seeds the shared `merqo.vendor_profile` via `getOrCreateVendorProfile(supabase, user_id, null)` (same call `onboarding/actions.ts`'s `createVendor` makes, `null` stall name since no vendor input exists here). A `23503` (unknown `user_id` — no matching `auth.users` row) returns `400`. Always reads back and returns the vendor's current `plan`, whether this call created the row or it already existed. Before responding, best-effort logs a `qkit.admin_audit` row via `recordAudit()` (`action: "merqo_vendor_provision"`, `admin_id`/`target_id` both the vendor's own id, `detail.actor: "merqo_system"` marking it as merqo-initiated rather than vendor-initiated) — never blocks the response on failure.

## Connectivity

Calls `createServiceClient()`, `provisionBearerOk()` (`@/lib/merqo-auth`), `getOrCreateVendorProfile()` (`@/lib/merqo-vendor-profile`, also used by `onboarding/actions.ts`), and `recordAudit()` (`@/lib/audit`).

## Parent

[merqo](../README.md)
