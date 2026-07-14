# downgrade-request

## Purpose

Endpoint the Merqo product calls to move a vendor back to the free plan (e.g. when Merqo's own subscription lapses), keyed by email rather than a qkit session.

## Contents

- `route.ts` — `POST(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check, constant-time compare, verbatim copy of `metrics/route.ts`'s guard — kept in lockstep by comment convention). Body validated with `z.object({ email: z.string().email() })`. Looks up the auth user by email via `supabase.auth.admin.listUsers({ perPage: 1000 })` (case-insensitive match), reads the matching `vendors` row's `plan`, and feeds `(vendorFound, currentPlan)` to `resolveDowngradeOutcome()` (`@/lib/merqo-downgrade-request`) to decide one of three outcomes: `not_found` → 404, `already_free` → 200 no-op, or downgrade → `UPDATE vendors SET plan = 'free'` plus a best-effort clear of any pending `monthly` `purchase_requests` row. Returns `{ success, error? }` JSON with 401/400/404/503/200 status codes as appropriate.

## Connectivity

Calls `createServiceClient()` (`@/lib/supabase/server`) and `resolveDowngradeOutcome()` (`@/lib/merqo-downgrade-request`) for the pure decision logic. Shares its `bearerOk()` auth guard and the `listUsers` 1000-user-page limitation with `../upgrade-request/route.ts` and `../vendor-status/route.ts`. Called by the external Merqo product, not by any code inside this repo.

## Parent

[merqo](../README.md)
