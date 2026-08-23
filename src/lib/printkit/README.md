# printkit

## Purpose

Server-only HTTP client for printkit's `/api/v1/print-jobs` (job creation)
and `/api/v1/print-locations` (location registration) APIs — a separate
sibling kit that bridges an order to a vendor's physical kitchen/receipt
printer. Status changes flow the other direction (printkit calls qkit's own
`/api/printkit/print-status` route, not covered by this module).

## Contents

- `client.ts` — `createPrintJob({vendorId, orderId, boothId, customerName,
orderNumber})`: fires a job-creation request and returns a
  `PrintkitResult<{id}>` (`{ok:true,data}` | `{ok:false,status,error}`),
  never throwing. `registerPrintLocation({vendorId, sourceRef, label,
  active})`: registers/updates a booth as a printkit "print location" —
  `active` mirrors the booth's own `print_enabled`, and printkit uses a
  vendor's active-location count to decide auto-delivery (exactly one active
  location auto-delivers; 2+ stays queued for manual assignment), so a booth
  that's deleted or has printing turned off must be re-registered with
  `active: false`, never just left alone. Both functions read
  `PRINTKIT_KIT_SECRET` and `NEXT_PUBLIC_PRINTKIT_URL` at request time (not
  import time). Unlike `../paykit/client.ts`, an unset
  `NEXT_PUBLIC_PRINTKIT_URL` has **no fallback host** — it degrades to the
  same "not configured yet" result as a missing secret rather than guessing a
  `*.vercel.app` subdomain, since printkit has no live deployment yet and a
  wrong guess would POST the bearer secret to an unclaimed/wrong host.
  Bearer-authenticates as `Authorization: Bearer qkit:<secret>`, validating
  the response body against a local Zod schema.
- `client.test.ts` — tests, for both functions, the missing-secret degrade
  path, the missing-URL fail-closed path (both never call `fetch`), the
  bearer header/payload shape, non-2xx error-body surfacing, network-failure
  handling, and an invalid-JSON response body (both collapse to `ok:false`
  without throwing — the latter is exactly what happens today against
  printkit's current production deployment, since `/api/v1/print-locations`
  doesn't exist there yet and returns an HTML 404 page).

## Connectivity

`createPrintJob` is called from `src/app/o/[code]/actions.ts`
(`notifyPrintkit`, fired best-effort from `placeOrder` after a successful
order, gated on the booth's `print_enabled` — looks up the order's real `id`
itself, since `place_order`'s RPC output carries none, and marks
`orders.print_status = 'queued'` on a successful job creation).
`registerPrintLocation` is called from `src/app/dashboard/booths/actions.ts`
(`syncPrintLocation`, best-effort from both `saveBooth`, matching
`print_enabled`, and `deleteBooth`, always `active: false`).
`PRINTKIT_KIT_SECRET` / `NEXT_PUBLIC_PRINTKIT_URL` are the two env vars this
module reads.

## Parent

[lib](../README.md)
