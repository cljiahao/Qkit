# completed

## Purpose

Paginated history of a vendor's completed orders — the live board drops an
order from view the moment it's marked picked up (by design, so the active
queue stays uncluttered); this is where a vendor pulls it back up.

## Contents

- `completed-orders-list.dom.test.tsx` — RTL tests for `CompletedOrdersList`:
  the empty state, the load-error banner, one `OrderCard` per order, the
  booth banner only appearing for a multi-booth vendor, pagination past the
  first page, the always-visible page count, the booth filter, the date
  range filter, the search box, the no-match state, and the history-cap
  note.
- `completed-orders-list.tsx` — `CompletedOrdersList({ booths, orders,
loadError, historyLimit })` client component: a date-range segmented filter
  (Today/7 days/30 days/All time, filtering on `completed_at` — falls back
  to `created_at` if unset — against a cutoff computed on click, not on
  initial render, so the default "All time" render matches server and
  client exactly with no hydration-mismatch risk), a booth-filter `Select`
  (multi-booth only), and a search `Input` (order number or customer name,
  case-insensitive substring) narrow `orders` client-side before rendering
  a `Paginated` (`variant="pager"`, 12/page, `alwaysShowCount` so the "x–y
  of N" readout confirms nothing got filtered away even on a single page)
  grid of `OrderCard`s (`showDate` — every card here spans potentially
  months, unlike the live board's same-day cards). Separate empty states:
  "No completed orders yet" (nothing at all) vs. "No matching orders"
  (filter/search narrowed to zero). A retry banner on a load error, and a
  one-line note when the fetch hit `historyLimit` (the list isn't
  unbounded).
- `page.tsx` — `CompletedOrdersPage()` (server, `revalidate = 0`): reuses
  `requireEntitledVendor()`, reads the vendor's booths, then reads up to 500
  `status = 'completed'` orders across them (`BOARD_ORDER_COLUMNS`, newest
  `completed_at` first), and renders `CompletedOrdersList`.

## Connectivity

Reached at `/dashboard/completed`, linked from `dashboard-nav.tsx`'s `LINKS`.
`page.tsx` runs the same booths→orders query shape as `../page.tsx` (the live
board), just filtered to `completed` instead of excluding it, and passes the
result to `completed-orders-list.tsx`. `OrderCard` (`@/components`) renders
read-only here — its action buttons are all gated on `!closed`, which a
completed order never is.

## Parent

[dashboard](../README.md)
