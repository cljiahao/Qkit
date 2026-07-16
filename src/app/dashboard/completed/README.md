# completed

## Purpose

Paginated history of a vendor's completed orders — the live board drops an
order from view the moment it's marked picked up (by design, so the active
queue stays uncluttered); this is where a vendor pulls it back up.

## Contents

- `completed-orders-list.dom.test.tsx` — RTL tests for `CompletedOrdersList`:
  the empty state, the load-error banner, one `OrderCard` per order, the
  booth-name chip only appearing for a multi-booth vendor, pagination past
  the first page, and the history-cap note.
- `completed-orders-list.tsx` — `CompletedOrdersList({ booths, orders,
loadError, historyLimit })` client component: renders a `Paginated`
  (`variant="pager"`, 12/page) grid of `OrderCard`s, an empty state when
  there are none, a retry banner on a load error, and a one-line note when
  the fetch hit `historyLimit` (the list isn't unbounded).
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
