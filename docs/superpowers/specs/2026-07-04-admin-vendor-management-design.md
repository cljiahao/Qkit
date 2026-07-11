# Admin vendor management — design

Date: 2026-07-04 · Status: approved, building

## Problem

The admin surface today shows aggregates (fleet KPIs, activation funnel counts,
QKit revenue, upgrade-request inbox, pricing, audit log) but never a single
vendor's story. The admin cannot answer "is this vendor okay?" — no per-vendor
last-active, order count, booth count, revenue, funnel stage, or pass/payment
state in one place. Vendor-side failures (pass/pro/payment problems) have no
channel to reach the admin except the founder's personal inbox.

## Goal

Give the solo-founder admin (a) a per-vendor overview to spot who is thriving vs
struggling, and (b) a way for vendors to report problems (pass/pro/payment/other)
that the admin reads and resolves **inside the admin dashboard** — no email.

Grounded in operator-dashboard consensus (health bands, "attention needed"
inbox, overview-triage → per-vendor drill-down, cap tiles, avoid vanity metrics,
numbers-with-context). Sources in the research brief attached to the session.

## Scope decisions

- **Approach A (data-first).** Status + detail + inbox derive from existing
  tables (`vendors`, `booths`, `orders`, `licenses`, `payments`,
  `purchase_requests`) plus one new `support_messages` table. No new error/event
  plumbing.
- **No 0-100 health score.** QKit lacks the login/engagement telemetry a real
  composite score needs; a score from order-recency alone is false precision
  (the "numbers without context" anti-pattern). Use honest **banded status
  chips** + real columns (last order, 7d trend) instead.
- **Deferred (Approach B):** capturing technical `console.error` failures into a
  `vendor_errors` table. Revisit only if crashes prove a real support driver;
  prefer Sentry over hand-rolling if so.
- **Future note:** a way to push/notify the QKit team of new messages
  (realtime/email). `support_messages` is shaped so a notify layer bolts on
  later (status + created_at + category, resolvable) without rework. Not built
  now.

## Vendor status (rule-based, first match wins)

Computed per vendor from existing data + open support messages:

- **Needs attention** — has an unresolved support message, OR a payment
  claimed-but-unconfirmed order, OR pass expired while still on Pro
  (inconsistency).
- **Expiring** — a live pass ends in < 48h.
- **Stuck** — signed up ≥ 3d ago with no booth, OR a booth ≥ 3d with no orders,
  OR Pro with 0 orders ever.
- **Quiet** — was active but no orders in the last 14d.
- **Healthy** — took an order within the 14d window.
- **New** — signed up < 3d ago, no penalty yet.

Pure function in `src/lib/admin-vendor-health.ts`, unit-tested. Reuses
`latestActivePassByVendor` and `MS_PER_DAY`.

## Surfaces

1. **Vendors list** (`/admin/vendors`) — one row per vendor, default-sorted by
   risk (Needs attention → Expiring → Stuck → Quiet → New → Healthy). Columns:
   Name · Status · Plan/Pass · Last order · Orders 7d (▲▼) · Booths · Signed up ·
   Manage. Within the 5-9 column cap.
2. **Per-vendor detail** (`/admin/vendors/[id]`) — activation timeline (signed
   up → booth → first order → Pro), orders/booths/revenue, pass/license/plan/
   payment state, this vendor's support messages (resolve inline), and the
   grant/revoke/plan actions. Scoped queries only (not the fleet fetch-all).
3. **"Needs attention" inbox** on the overview — one unified list extending the
   existing upgrade-request pattern: unresolved support messages, expiring
   passes, pro-no-orders, unconfirmed payments, stuck onboarding. Each row links
   to the vendor detail.
4. **Support messages** — vendors send from the dashboard account menu (a "Get
   help" Sheet mirroring the existing Feedback Sheet); admin reads/resolves in
   the inbox + on vendor detail.

## Data model — `support_messages` (migration 0047)

Mirrors `purchase_requests` (vendor-owned, admin-read, resolvable):

```
id          uuid pk default gen_random_uuid()
vendor_id   uuid not null references vendors(id) on delete cascade
category    text not null check in ('pass','payment','pro','other')
body        text not null check (char_length between 1 and 2000)
status      text not null default 'open' check in ('open','resolved')
created_at  timestamptz not null default now()
```

RLS: vendor inserts/reads own (`vendor_id = auth.uid()`); admin reads all + updates
(`public.is_admin(auth.uid())`). Index on `(status, created_at desc)` for the
inbox. Admin resolves via the service-role client, like `resolvePurchaseRequest`.

## Server actions

- `submitSupportMessage({ category, body })` (vendor) — Zod-validated, normal
  client insert (RLS scopes to self), never throws to the UI.
- `resolveSupportMessage({ id })` (admin) — `requireAdmin`, service-role update
  to `resolved`, `recordAudit`, `revalidatePath('/admin')`. Mirrors
  `resolvePurchaseRequest`.

## Testing

- `admin-vendor-health.test.ts` — status rules per branch (node/pure, mutation
  scope).
- Component DOM tests for the status chip + vendors list + inbox rendering.
- Action tests for `submitSupportMessage` / `resolveSupportMessage` mirroring
  the existing admin `actions.test.ts` mocks.
- RLS covered by CI pgTAP where the harness already asserts vendor/admin
  isolation.

## Latency

- Overview adds exactly one parallel `support_messages` query to the existing
  `Promise.all`. Per-vendor detail uses vendor-scoped queries (filter by
  vendor_id / booth_id), never the fleet fetch-all. Status derivation is O(n)
  over already-fetched rows.
