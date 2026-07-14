# vendor-status

## Purpose

Endpoint reporting a single vendor's current plan/status to the Merqo product, looked up by email.

## Contents

- `route.ts` — `GET(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check against `MERQO_METRICS_SECRET`, constant-time compare). Reads `email` off the query string, validated with `z.object({ email: z.string().email() })`. Fetches all auth users (`supabase.auth.admin.listUsers({ perPage: 1000 })`) and all `vendors` (id/plan) in parallel, then passes them to `resolveVendorStatus(email, users, vendors)` (`@/lib/merqo-vendor-status`) to produce the response JSON. Logs (but doesn't fail loudly beyond a console error) when `listUsers` returns a full 1000-row page, since pagination isn't implemented.

## Connectivity

Calls `createServiceClient()` and `resolveVendorStatus()` (`@/lib/merqo-vendor-status`) for the pure matching logic. Shares its `bearerOk()` auth guard and the `listUsers` first-page-only limitation with `../downgrade-request/route.ts` and `../upgrade-request/route.ts`.

## Parent

[merqo](../README.md)
