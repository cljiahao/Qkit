# print-status

## Purpose

Inbound callback printkit fires as a print job progresses/finishes, so a
vendor's dashboard board can surface a "Print failed" badge without qkit
having to poll printkit.

## Contents

- `route.ts` — `POST(request)`. Guarded by `printkitCallbackBearerOk()`
  (shared-secret `Authorization: Bearer` check against
  `PRINTKIT_CALLBACK_SECRET`, constant-time compare via `timingSafeEqual`,
  imported from `@/lib/qkit-printkit-auth`). Validates the body
  (`{order_id: string, status: "queued"|"sent"|"printed"|"failed"}`) with a
  local Zod schema, then updates `orders.print_status`/
  `print_status_updated_at` via `createServiceClient()`, keyed on `id`.
  Returns 401 on a bad/missing bearer, 400 on an unparseable body,
  503 on a DB write failure, 200 (`{ok:true}`) otherwise.
- `route.test.ts` — tests the 401/400/200/503 branches against a mocked
  `printkitCallbackBearerOk`/Supabase client.

## Connectivity

Called by printkit's own print-job worker as a job's status changes — see
printkit's own repo for the caller side. Feeds `orders.print_status`, read
by `@/components/order-card.tsx`'s `PrintBadge` (renders only on `"failed"`;
`"queued"`/`"sent"`/`"printed"`/`"not_required"` are silent, v0.1 scope).

## Parent

[printkit](../README.md)
