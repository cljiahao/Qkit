# admin

## Purpose

Internal admin dashboard — vendor management, revenue/activation stats, pricing, and support/upgrade-request resolution. Every route under this folder is gated by `requireAdmin()` (404s non-admins).

## Contents

- `actions.ts` — `"use server"` module, all admin-only mutations (each starts with `await requireAdmin()` and writes via `createServiceClient()` since RLS scopes normal writes to self):
  - `setVendorPlan({ vendorId, plan, amountCents?, note? })` — flips a vendor's `plan`; on a genuine free→pro transition with `amountCents > 0` also inserts a `payments` row (subscription revenue), and on any pro flip clears the vendor's pending upgrade requests. Idempotent against double-clicking an already-pro vendor (no duplicate payment row).
  - `grantPass(input: GrantPassInput)` — mints a time-boxed `licenses` row (`valid_from` → `valid_from + days*MS_PER_DAY`), optionally records a `payments` row, clears pending requests, audits the action.
  - `resolvePurchaseRequest({ id })` — mark a `purchase_requests` row resolved.
  - `resolveSupportMessage({ id })` — mark a row in the shared `merqo.support_messages` table resolved (via `.schema("merqo")` on the service client — service-role bypasses RLS regardless of schema); audits against the message's `user_id`.
  - `revokePass({ vendorId })` — ends a vendor's live pass(es) now (`expires_at = now`) rather than deleting — access-only revoke, not a refund.
  - `setPricing(input: PricingFormInput)` — updates the single `pricing` row (id=1) shown on the vendor offer page; revalidates `/admin` and `/dashboard/plan`.
  - `recordAudit()` (private) — best-effort insert into `admin_audit`, logged but never blocks the action it records.
- `actions.test.ts` — Vitest coverage of `setVendorPlan`, `grantPass`, `resolveSupportMessage` against mocked Supabase fluent chains (vendors/licenses/payments/admin_audit/purchase_requests), verifying ledger inserts only fire on genuine transitions.
- `activation-funnel.tsx` — `ActivationFunnelView({ funnel: ActivationFunnel })`. Renders the 4-stage vendor activation funnel (Signed up → Created a booth → Took an order → Upgraded to Pro) as drop-off bars with step-over-step conversion percentages.
- `admin-nav.tsx` — `AdminNav` client component; the tab strip (Overview / Vendors / Feedback) linking `/admin`, `/admin/vendors`, `/admin/feedback`, highlighting the active tab via `usePathname()`.
- `layout.tsx` — `AdminLayout`. Calls `requireAdmin()` to gate the entire `/admin` subtree, computes an "attention" badge count (open support messages + pending purchase requests, via parallel `head:true` counts), renders the header (brand, notification bell, sign-out form) and `<AdminNav>`.
- `page.tsx` — `AdminPage`, the overview route (`revalidate = 0`). Fetches vendors/booths/orders/events/admin_audit/pricing/licenses/payments/purchase_requests in one `Promise.all` via the RLS-scoped server client, plus open help requests from the shared `merqo.support_messages` table (filtered by `kit_slug='qkit'`) via the service client with a schema override — the same RLS gap as the feedback page's vendor-NPS read (`merqo.support_messages`'s SELECT policy checks `merqo.merqo_team` membership, not `qkit.admins`). Derives: qkit's own revenue (`payments` ledger, 30d + all-time) vs. GMV (vendor sales via `orders`), a 7d-vs-prior-7d order delta, a 14-day revenue trend (via `windowSeries`/`pctChange` from `@/lib/stats`), the activation funnel (via `@/lib/admin-stats`), and lists of pending upgrade requests / open help requests. Lazy-loads `TrendChart` (code-split, pulls in `recharts`) and renders `PricingForm`, `ActivationFunnelView`, `Stat` tiles, and a recent-admin-activity audit log.
- `pricing-form.tsx` — `PricingForm({ initial })` client component; edits `event_pass_cents`/`monthly_cents` (via `centsToDollarString`/`parseDollarsToCents`) and calls `setPricing` on save.
- `resolve-message-button.tsx` — `ResolveMessageButton({ id })` client component; calls `resolveSupportMessage({ id })` in a transition, toasts, and `router.refresh()`s.
- `resolve-request-button.tsx` — `ResolveRequestButton({ id })` client component; calls `resolvePurchaseRequest({ id })`, same toast/refresh pattern.
- `stat.tsx` — `Stat({ label, value, delta?, big?, featured?, delay? })` — a back-office KPI tile (Space Mono numerals); `Delta({ pct })` renders a period-over-period up/down chip. Used throughout `admin/page.tsx`, `admin/vendors/page.tsx`, and the vendor detail page.
- `vendor-list.tsx` — `VendorList({ vendors: VendorListItem[] })`. Renders the paginated (`Paginated`, page size 15) vendor triage list, one row per vendor linking to `/admin/vendors/[id]`, showing a `StatusChip`, plan, active-pass hours-left, 7d orders, booth count, and last-order date.
- `vendor-manage.tsx` — `VendorManage({ vendor: AdminVendorRow })` client component. The grant-pass / revoke / flip-plan panel for one vendor: parses a dollar amount to cents (blank = free comp), interprets the pass start date as SGT midnight (not browser/UTC), and calls `setVendorPlan`, `grantPass`, or `revokePass`.
- `vendor-status.tsx` — `StatusChip({ status: VendorStatus })`. Colour-coded badge for `attention | expiring | stuck | quiet | new | healthy`, driven by `@/lib/admin-vendor-health`.
- `feedback/` — sub-route: admin view of submitted vendor/customer feedback (NPS + CSAT).
- `vendors/` — sub-route: vendor list + per-vendor (`[id]`) management pages.

## Connectivity

`layout.tsx` wraps every route below it (including `feedback/` and `vendors/`) and is the only place `requireAdmin()`-gating and the attention-bell count live; `feedback/` and `vendors/` are sub-routes reusing `Stat`, `StatusChip`, `VendorManage`, and `ResolveMessageButton` from this folder rather than duplicating them. `page.tsx` is the overview dashboard, built from this folder's own components (`ActivationFunnelView`, `PricingForm`, `Stat`, the two resolve buttons) plus a lazy import of `dashboard/stats/trend-chart`. `actions.ts` is called by `pricing-form.tsx`, `vendor-manage.tsx`, `resolve-message-button.tsx`, `resolve-request-button.tsx`, and by `admin/vendors/[id]/page.tsx` (indirectly via `VendorManage`/`ResolveMessageButton`) — all client components trigger these server actions via `useTransition`, then `router.refresh()`.

## Parent

[app](../README.md)
