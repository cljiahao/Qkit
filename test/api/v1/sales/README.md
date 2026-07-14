# sales

## Purpose

Tests for the `src/app/api/v1/sales/` route handlers — the versioned sales-
summary export that external tools and sibling -kit products consume.

## Contents

- `summary.test.ts` — handler-glue tests for `GET /api/v1/sales/summary`
  (`src/app/api/v1/sales/summary/route.ts`). Deliberately does NOT re-test
  the pure aggregation logic (`computeStats`/`toSalesSummaryV1` are unit-
  tested in `src/lib/`); instead mocks `@/lib/supabase/get-entitlement`'s
  `loadEntitlement` and `@/lib/supabase/server`'s `createServerClient` to
  verify the route's own glue logic: 401 when there's no authenticated
  vendor (and the data layer is never touched); a requested `range` within
  the vendor's `entitlement.statsRanges` passes through unchanged; a range
  outside the plan's allowed set clamps to the largest allowed range (e.g.
  `90d` clamps to `7d` for a vendor entitled only to `24h`/`7d`); the default
  range is `7d` when none is supplied (and it's allowed); a `booth` filter
  scoped to a booth the vendor actually owns passes through; and a `booth`
  filter for a booth the vendor does NOT own falls back to `"all"` rather
  than leaking another vendor's stats.

## Connectivity

Tests `src/app/api/v1/sales/summary/route.ts`, which is built on
`@/lib/stats.ts`'s `computeStats` and `@/lib/sales-summary.ts`'s
`toSalesSummaryV1` (the frozen `SalesSummaryV1` contract), gated by
`@/lib/supabase/get-entitlement.ts`'s `loadEntitlement` for auth and
plan-based range entitlement (`@/lib/plan.ts`'s `Entitlement.statsRanges`).

## Parent

[v1](../README.md)
