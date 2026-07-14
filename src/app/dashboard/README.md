# dashboard

## Purpose

The authenticated vendor area — a shared header/nav shell wrapping the live order board plus sub-routes for booth management, billing, account, board preferences, analytics, and support.

## Contents

- `booths/` — booth list, create/edit form, and printable QR-code sub-routes.
- `dashboard-nav.dom.test.tsx` — RTL/jsdom tests for `DashboardNav`: asserts the inline nav links (Orders/Booths/Stats, no Plan link) and the account-menu item order (Profile, Board settings, Plan, Get help, Feedback, then Sign out).
- `dashboard-nav.tsx` — `DashboardNav({ signOut, vendorName, avatarUrl, tier })` client component: the sticky header row. Left side is a mobile burger (`Menu`/`X`) plus inline `Orders`/`Booths`/`Stats` links (`LINKS` array) from `sm` up, with active-route highlighting via `isActive`/`usePathname`; right side is an account dropdown (avatar with `initials()` fallback, a `TierBadge` reflecting the vendor's plan tier) linking to Profile, Board settings, Plan, and opening `Get help`/`Feedback` `Sheet` drawers (rendering `SupportForm`/`FeedbackForm`) before a `signOut` form submit.
- `feedback/` — vendor-facing "share feedback about QKit" page.
- `layout.tsx` — `DashboardLayout({ children })` server component: resolves `user`/`vendor`/`entitlement` via `loadEntitlement()`, redirects to `/login` if signed out, `/admin` if the user `isAdmin()`, `/onboarding` if there's no vendor row yet (before the header shell paints, avoiding a blank-flash). Renders the sticky header with `DashboardNav`, a `signOut` server action, and `DashboardTour` (onboarding tour, gated on `vendor.tour_seen_at`).
- `loading.tsx` — `Loading()`: the segment's Suspense fallback, a centered spinning `Loader2`, shown while a nested page is slow to resolve.
- `order-actions.test.ts` — vitest suite mocking the Supabase server client's fluent chain to unit-test `advanceOrder`/`confirmOrderPayment`/`cancelOrder`, including the optimistic-concurrency "0 rows updated → refresh" path and the no-refund-rail rejection.
- `order-actions.ts` — server actions for the order board, gated by `getUser()` and RLS (never service-role): `advanceOrder(orderId)` moves an order to its `ADVANCE`-derived next status guarded by a conditional `UPDATE ... WHERE status = <read status>` (so a concurrent change yields "Order changed — please refresh" instead of clobbering it); `confirmOrderPayment(orderId)` marks a claimed order's `payment_status` as `confirmed` (idempotent, rejects `not_required`/cancelled); `cancelOrder(orderId)` cancels a non-terminal order but refuses one with `payment_status: "confirmed"` (no refund rail — money already "real" can't be cancelled away).
- `page.tsx` — `DashboardPage()` (server, `revalidate = 0`): reuses the layout's primed `requireEntitledVendor()` cache, reads the vendor's `booths` (id/name/is_active/hours) and computes `open`/closed per booth via `isBoothOpen`, reads non-terminal `orders` (`BOARD_ORDER_COLUMNS`) across those booths, and renders `RealtimeOrderBoard` with a `loadError` flag (a DB read error surfaces a retry banner instead of masquerading as an empty board).
- `plan/` — billing/plan page (current tier, pass countdown, upgrade CTAs).
- `profile/` — vendor account profile page (stall name, avatar, display name, password).
- `realtime-order-board.tsx` — `RealtimeOrderBoard({ booths, initialOrders, boardSettings, loadError })` client component: the live order board itself. Subscribes via `useRealtimeOrders(boothIds, initialOrders, handleNewOrder)`, plays a sound and fires a toast/desktop notification (`fireNewOrderNotification`) on a new order while the tab is hidden, tracks an "away" badge reflected into `document.title`, filters/sorts active orders (`sortActiveOrders`, `isTerminal`), renders a per-booth `BoothTab` filter row when multi-booth, an empty/"No booths yet" state linking to `/dashboard/booths/new`, an idle "All caught up" state, and a grid of `OrderCard`s otherwise.
- `settings/` — board preferences sub-route (not covered by this batch).
- `stats/` — analytics sub-route (not covered by this batch).
- `tour-actions.ts` — `markTourSeen()` server action: best-effort stamps `vendors.tour_seen_at` for the signed-in user so the onboarding tour stops auto-running; failures are logged but never surfaced (worst case the tour just shows once more).

## Connectivity

`layout.tsx` gates every route under `/dashboard` (auth/vendor/admin redirects) and renders `dashboard-nav.tsx` around `{children}`; `page.tsx` is the `/dashboard` index route and renders `realtime-order-board.tsx`, which calls the order-mutation actions in `order-actions.ts` indirectly via `OrderCard` and subscribes through `@/hooks/use-realtime-orders`. `dashboard-nav.tsx` links out to `booths/`, `plan/`, `profile/`, `settings/`, `stats/`, `feedback/` — the dashboard's sub-routes for booth management, billing, account, board preferences, analytics, and support respectively. `tour-actions.ts` is called by `DashboardTour` (in `@/components`) once the tour completes.

## Parent

[app](../README.md)
