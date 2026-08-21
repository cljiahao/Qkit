# printkit

## Purpose

Endpoint the sibling printkit product calls into: the inbound half of the
qkit↔printkit print-job integration (the outbound half — qkit creating a
print job — is `@/lib/printkit/client.ts`, not a route). Machine-to-machine
(no user session).

## Contents

- `print-status/` — `POST` endpoint printkit calls with a print job's
  terminal (or in-flight) status; see its own README.

## Connectivity

Guarded by `printkitCallbackBearerOk(request)` from
`@/lib/qkit-printkit-auth` — a plain shared-secret bearer check against
`PRINTKIT_CALLBACK_SECRET`, no `kit_slug:` prefix (unlike `PAYKIT_KIT_SECRET`
in `../../../lib/paykit/client.ts`), since printkit has exactly one caller
registered for this endpoint. Writes land on `orders.print_status`/
`print_status_updated_at` via `createServiceClient()`, surfaced on the
dashboard board as `PrintBadge` in `@/components/order-card.tsx`.

## Parent

[api](../README.md)
