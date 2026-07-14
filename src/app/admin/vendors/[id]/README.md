# [id]

## Purpose

Per-vendor admin detail/management page, keyed by vendor id — the single place an admin reviews one vendor's activity and takes action (grant/revoke pass, flip plan, resolve help requests).

## Contents

- `page.tsx` — `AdminVendorDetailPage({ params: Promise<{ id }> })` async server component (`revalidate = 0`). Gated by `requireAdmin()`; 404s via `notFound()` if the vendor doesn't exist. Fetches the vendor row, its booths, licenses, and support messages in parallel (all scoped to this one `id`, never a fleet-wide fetch), then a follow-up scoped `orders` query keyed to the vendor's booth ids. Derives health via `buildVendorHealth()`, active-pass hours-left via `passHoursLeft()`, revenue (sum of non-cancelled order totals), and an activation timeline (`Milestone` rows: signed up / created a booth / took first order / upgraded to Pro). Renders `Stat` tiles, the activation checklist, the vendor's help-request thread (each open one gets a `ResolveMessageButton`), and the `VendorManage` action panel plus a raw license history list.

## Connectivity

Reuses `Stat` from `../../stat`, `StatusChip` from `../../vendor-status`, `VendorManage` from `../../vendor-manage`, and `ResolveMessageButton` from `../../resolve-message-button` — all admin-folder-root components, not duplicated here. Linked to from each row of `admin/vendors/page.tsx`'s `VendorList`, and from help-request rows on `admin/page.tsx`.

## Parent

[vendors](../README.md)
