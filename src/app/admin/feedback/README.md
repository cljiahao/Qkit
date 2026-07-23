# feedback

## Purpose

Admin view of submitted vendor/customer feedback — qkit's own vendor loyalty metric (NPS) alongside customer ordering-experience satisfaction (CSAT), platform-wide and per-vendor.

## Contents

- `page.tsx` — `AdminFeedbackPage` async server component (`revalidate = 0`). Gated by `requireAdmin()`. Fetches the local `feedback`, `booths`, and `vendors` tables via `createServerClient()`, plus vendor NPS via a separate service-role read of the shared `merqo.vendor_feedback` table (`kit_slug = 'qkit'`), then:
  - the merqo-sourced vendor NPS rows feed `npsBreakdown()` (from `@/lib/nps`) for the headline NPS score, detractor/passive/promoter bar, and any written NPS comments (paginated via `Paginated`) — vendor feedback converged to the shared cross-kit table (`merqo.submit_vendor_feedback`, called from `qkit.submit_feedback`'s vendor branch); qkit no longer writes new vendor rows to its own local `feedback` table, see `docs/superpowers/specs/2026-07-23-qkit-vendor-feedback-convergence-design.md` in the merqo repo.
  - local `customer`-source rows (unchanged, still qkit's own) feed `summarizeReviews()` (from `@/lib/reviews`) for a platform-wide CSAT average, star distribution, and rating-count histogram.
  - joins customer ratings → `booths.vendor_id` → each vendor's stall name (resolved via `vendorStallNames`, `@/lib/admin-vendor-names`) to build a per-vendor CSAT table (`vendorCsat`), sorted worst-rated first so problem vendors surface; only aggregate scores are shown, never the raw review text (that stays with the vendor's own stats).
  - Local helpers: `when(iso)` formats a timestamp; `Seg` renders one flex-grow segment of the NPS bar; `StarRow` renders a 5-star rating row.

## Connectivity

Reads three tables directly (no server actions here — it's read-only). Depends on `@/lib/nps` and `@/lib/reviews` for the score math, and on `Paginated`/`Ticket` shared components. Sibling to `admin/vendors/` under the `admin/layout.tsx` shell, reachable via the "Feedback" tab in `admin/admin-nav.tsx`.

## Parent

[admin](../README.md)
