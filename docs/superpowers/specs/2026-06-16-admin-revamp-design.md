# Admin Page Revamp — Design (2026-06-16)

## Overview

Rework `/admin` from a flat 12-card grid into a validation/activation-focused
operator view. Lead with a north-star metric, add a real activation funnel and a
usage trend, humanise the audit log. Keep the vendor table + plan toggle. Built
with frontend-design (Kraft & Ember), mobile-first; `templatecentral:standards`
drift check after.

## Research basis (web, 2026-06-16)

One north-star metric front-and-centre (top-left, largest, F-pattern); system
state legible in 3s; ≤12 KPIs (cognitive overload past that); trends/Δ over
point-in-time totals. Standard SaaS north stars (MRR/churn/CAC) DO NOT APPLY —
payments are deferred — so the honest north star is usage/activation, no
fabricated revenue. Sources: Improvado, 925studios, TailAdmin.

## Sections (new hierarchy)

1. **North-star KPI band** — ≤6 cards, F-pattern. Lead (largest, top-left):
   **Active vendors** = vendors who have taken ≥1 order (the validation signal).
   Then: Orders · 7d (Δ vs prior 7d), Vendors (total), Signups · 7d (Δ vs prior
   7d), Pro.
2. **Activation funnel (new centerpiece)** — Signed up → Created a booth → Took
   an order → Upgraded to Pro, with counts, step conversion %, and drop-off
   bars. Answers "are vendors activating?".
3. **Orders trend** — reuse `windowSeries` + `TrendChart`; orders over the last
   14 days so growth reads in 3s.
4. **Vendors table** — unchanged (plan free⇄pro toggle).
5. **Recent admin activity** — humanise: readable action + key:value detail +
   trimmed timestamp (drop raw `JSON.stringify`).

Drops the flat Subscriptions/Activity/Funnel grids; the useful counts move into
the band + funnel. CTA-click counts demoted to one small supporting line.

## Data / architecture

- New pure `activationFunnel(vendors, booths, orderBoothIds)` in
  `lib/admin-stats.ts` → `{ signedUp, withBooth, withOrder, pro }`. Pure + tested.
- `admin/page.tsx` consolidates to ~5 queries (Promise.all): vendors; booths
  `(id, vendor_id, is_active)`; orders `(booth_id, status, total_cents,
  created_at)`; events; audit. Everything (funnel, 7d/prior counts + Δ, trend
  series) is derived in-memory from those.
  - NOTE: fetching all orders is fine at validation scale; revisit with
    aggregation if volume grows (leave a comment).
- New `activation-funnel.tsx` (presentational). Reuse `TrendChart`. North-star
  cards: a small admin KPI card with optional Δ (local to the page).

## Testing

Unit-test `activationFunnel` (no booth, booth-no-order, order→vendor mapping,
pro count, ignores foreign vendor ids). Page is presentational/data-wiring —
rely on `pnpm build`. Optional RTL smoke on the funnel component.

## Out of scope

Per-vendor enrichment (booth/order counts in the table), anomaly detection,
CSV/export of admin data, anything payments-related.
