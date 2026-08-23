# printkit

## Purpose

Server-only HTTP client for printkit's `/api/v1/print-jobs` job-creation API —
a separate sibling kit that bridges an order to a vendor's physical
kitchen/receipt printer. Only one endpoint exists today; status changes flow
the other direction (printkit calls qkit's own `/api/printkit/print-status`
route, not covered by this module).

## Contents

- `client.ts` — `createPrintJob({vendorId, orderId, customerName,
orderNumber})`: fires a job-creation request and returns a
  `PrintkitResult<{id}>` (`{ok:true,data}` | `{ok:false,status,error}`),
  never throwing. Reads `PRINTKIT_KIT_SECRET` and `NEXT_PUBLIC_PRINTKIT_URL`
  at request time (not import time). Unlike `../paykit/client.ts`, an unset
  `NEXT_PUBLIC_PRINTKIT_URL` has **no fallback host** — it degrades to the
  same "not configured yet" result as a missing secret rather than guessing a
  `*.vercel.app` subdomain, since printkit has no live deployment yet and a
  wrong guess would POST the bearer secret to an unclaimed/wrong host.
  Bearer-authenticates as `Authorization: Bearer qkit:<secret>`, validating
  the response body against a local Zod schema.
- `client.test.ts` — tests the missing-secret degrade path, the missing-URL
  fail-closed path (both never call `fetch`), the bearer header/payload
  shape, non-2xx error-body surfacing, and network-failure handling (never
  throws).

## Connectivity

Called from `src/app/o/[code]/actions.ts` (`notifyPrintkit`, fired
best-effort from `placeOrder` after a successful order — looks up the
order's real `id` itself, since `place_order`'s RPC output carries none, and
marks `orders.print_status = 'queued'` on a successful job creation).
`PRINTKIT_KIT_SECRET` / `NEXT_PUBLIC_PRINTKIT_URL` are the two env vars this
module reads.

## Parent

[lib](../README.md)
