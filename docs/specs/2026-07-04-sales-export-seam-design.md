# QKit Sales Export Seam — Design

**Date:** 2026-07-04
**Status:** Contract frozen (v1, shipped); machine auth deferred by design.

## Summary

QKit is the first of a family of stackable **-kit** products (see the ecosystem
vision). A sibling product — e.g. an invoicing-kit — needs to pull a vendor's
sales figures from QKit rather than re-derive them. This documents the **read
seam** for that: what the contract is, how a sibling authenticates (later), and
what is deliberately built now vs when a real consumer lands.

The seam is ~70% already built. The route and its response shape exist and are
frozen; only machine authentication is intentionally deferred. This doc writes
the contract down so a future sibling author has something to build against
without reading source comments.

## What already exists

- **Endpoint:** `GET /api/v1/sales/summary` — `src/app/api/v1/sales/summary/route.ts`.
  Params: `?range=24h|7d|30d|90d` (default `7d`, clamped to the vendor's plan
  entitlement) and `?booth=<id>|all` (default `all`, validated against the
  vendor's own booths).
- **Frozen response:** `SalesSummaryV1` — `src/lib/sales-summary.ts`. Explicitly
  decoupled from the internal `StatsSummary` (which may churn), snake_case,
  versioned. Add fields additively; bump `version` for breaking changes.
- **Auth today:** the vendor's own Supabase session cookie (same-origin: the
  vendor's browser). RLS scopes every row to the vendor. There is **no**
  machine-auth path yet.
- **Error semantics:** a transient DB error returns **503** (`Upstream
unavailable`), never a `{revenue: 0}` zero-fill — a silent zero would make a
  downstream consumer under-invoice with no signal. Keep this.

## Contract (v1)

```
GET /api/v1/sales/summary?range=7d&booth=all
Authorization: Bearer qk_live_<raw>     # sibling (machine) path — FUTURE
# — or a vendor session cookie (today's same-origin path)

200 → SalesSummaryV1 (src/lib/sales-summary.ts)
401 Unauthorized      bad/missing credential
403 Forbidden         credential lacks the sales:read scope (future)
429 Too Many Requests rate-limited (future, per-key)
503 Upstream unavailable   DB error — never zero-fills
```

`SalesSummaryV1` carries: `version`, `generated_at`, `range`, `booth_id`,
`revenue_cents`, `order_count`, `aov_cents`, `cancelled`, `refunds_cents`,
`refund_count`, `fulfilment_rate`, `gross_margin` (or `null`), and `top_items`
(bounded to 10). This covers "sales by vendor by time" fully — an invoicing
sibling needs nothing more today. Do **not** add per-order or per-customer export
until a consumer actually requires it (YAGNI).

## Machine auth — the one real gap (deferred)

A sibling service can never hold the service-role key (server-only, secret), and
the vendor cookie is not available cross-product. So a sibling needs a scoped,
per-vendor credential. Recommended when a consumer lands:

**A hashed, per-vendor API key, checked in the route handler, reading via the
service-role client server-side.**

```sql
-- FUTURE migration: api_keys
CREATE TABLE public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,            -- sha256 of the raw key; raw shown once
  scopes       text[] NOT NULL DEFAULT '{sales:read}',
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;  -- reached only via
-- service-role (bypasses RLS); add a vendor-self SELECT policy only if a
-- "manage your keys" UI is built.
```

Request flow (drops into the existing route, additively):

1. Read `Authorization: Bearer qk_live_…`. Present → machine path; absent → keep
   today's cookie path (dashboard/same-origin still works).
2. `createServiceClient()`, look up `vendor_id, scopes` where
   `token_hash = sha256(raw) AND revoked_at IS NULL`.
3. No row → 401. Missing `sales:read` scope → 403. Else set `vendorId` and run
   the **existing query body** scoped to that vendor.
4. Rate-limit via the existing `check_rate_limit` RPC keyed on the key id → 429.

This honors the constitution: authz stays server-side, service-role stays in a
route handler, no secret in `NEXT_PUBLIC_*`, key stored hashed and shown once.

## Now vs later

- **Now:** nothing in code. The route + frozen shape already serve the
  same-origin vendor. Adding an `api_keys` table with zero consumers is exactly
  the speculative build to avoid.
- **Later (when a 2nd -kit lands):** the `api_keys` migration, the Bearer branch
  in the route, a vendor "generate key" UI, and rate-limit wiring. All additive;
  the response shape does not change.

## Open decision (record before the first integration)

`range` is clamped to the vendor's **plan entitlement** today (a free vendor
cannot request `90d`). A sibling on a free vendor's key inherits that cap.
Decide whether machine access should honor or bypass the plan gate before wiring
the first consumer.

## Cross-reference

The route comment (`route.ts:9-14`) already states the contract-frozen /
auth-deferred intent; this doc is the fuller companion. Mirrors the structure of
the payments seam design (`docs/specs/2026-06-28-qkit-payments-seam-design.md`):
frozen v1, deferred implementation.
