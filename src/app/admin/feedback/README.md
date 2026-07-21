# feedback

## Purpose

Admin view of submitted vendor/customer feedback — qkit's own vendor loyalty metric (NPS) alongside customer ordering-experience satisfaction (CSAT), platform-wide and per-vendor.

## Contents

- `page.tsx` — `AdminFeedbackPage` async server component (`revalidate = 0`). Gated by `requireAdmin()`. Fetches the `feedback`, `booths`, and `vendors` tables in parallel via `createServerClient()`, then:
  - splits feedback by `source` — `vendor` rows feed `npsBreakdown()` (from `@/lib/nps`) for the headline NPS score, detractor/passive/promoter bar, and any written NPS comments (paginated via `Paginated`).
  - `customer`-source rows feed `summarizeReviews()` (from `@/lib/reviews`) for a platform-wide CSAT average, star distribution, and rating-count histogram.
  - joins customer ratings → `booths.vendor_id` → each vendor's stall name (resolved via `vendorStallNames`, `@/lib/admin-vendor-names`) to build a per-vendor CSAT table (`vendorCsat`), sorted worst-rated first so problem vendors surface; only aggregate scores are shown, never the raw review text (that stays with the vendor's own stats).
  - Local helpers: `when(iso)` formats a timestamp; `Seg` renders one flex-grow segment of the NPS bar; `StarRow` renders a 5-star rating row.

## Connectivity

Reads three tables directly (no server actions here — it's read-only). Depends on `@/lib/nps` and `@/lib/reviews` for the score math, and on `Paginated`/`Ticket` shared components. Sibling to `admin/vendors/` under the `admin/layout.tsx` shell, reachable via the "Feedback" tab in `admin/admin-nav.tsx`.

## Parent

[admin](../README.md)
