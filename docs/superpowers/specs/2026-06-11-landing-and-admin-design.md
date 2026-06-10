# Landing page + admin dashboard + event tracking — design

Date: 2026-06-11

Three independent subsystems, built in order A → B1 → B2, one commit each.

## A. Public landing page (`/`)

`/` currently redirects (login/dashboard). Replace with a public marketing page.

- **Auth-aware**: server component reads the current user. Signed-in → primary
  CTA "Go to dashboard"; signed-out → "Get started" / "Sign in" → `/login`.
  No redirect — the page is always publicly viewable/shareable.
- **Sections**: public header (logo + Login/Get started) · hero (name, tagline,
  CTAs) · how it works (build booth → print QR → watch live orders) · why/moat
  (realtime board, QR ordering, menu customization, stats, SG-built) · pricing
  teaser (Free vs Pro) · FAQ (native `<details>`/`<summary>`, no new deps) ·
  footer.
- Reuses Kraft & Ember tokens/fonts from the root layout + globals.
- **Event hook**: the hero "Get started" CTA calls `logEvent("landing_cta")`
  (added in B2; until then it's a plain link).
- **Files**: rewrite `src/app/page.tsx`; section components under
  `src/app/(marketing)/_components/` (or inline). A `landing-cta.tsx` client
  component wraps the CTA so it can fire the event in B2.

## B1. Admin dashboard (`/admin`)

- **Schema** `migration 0004`: `vendors.is_admin BOOLEAN NOT NULL DEFAULT false`.
  Owner sets themselves admin in SQL.
- **Admin-read RLS**: a SECURITY DEFINER `public.is_admin(uid)` (pinned
  search_path) used to widen SELECT policies so an admin reads all rows:
  - `vendors`: `FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()))`
    (replaces `vendors_self_select`).
  - `booths`: add `booths_admin_select FOR SELECT USING (public.is_admin(auth.uid()))`.
  - `orders`: add `orders_admin_select FOR SELECT USING (public.is_admin(auth.uid()))`.
    Authorization stays in Postgres.
- **Server gate**: `requireAdmin()` in `src/lib/admin.ts` — `getVendor()`; if the
  vendor isn't admin → `notFound()` (404, doesn't reveal the route). Used by
  `/admin` pages and admin server actions.
- **Metrics** (derivable from existing tables):
  - vendors: total, by plan (free/pro) — the "subscriptions".
  - signups: vendors created in last 7/30d.
  - booths: total, active.
  - orders: total, last 7/30d, by status.
    Aggregation that operates on fetched rows lives in `src/lib/admin-stats.ts`
    (pure, tested); simple totals use Supabase `count`.
- **Plan management**: a vendor table (name, plan, created_at) with a free⇄pro
  toggle. `setVendorPlan(vendorId, plan)` Server Action: `requireAdmin()`, then
  the **service-role client** (allowed in Server Actions) updates the target row.
  Zod-validate inputs.
- **Files**: `src/lib/admin.ts`, `src/lib/admin-stats.ts` (+test),
  `src/app/admin/page.tsx`, `src/app/admin/actions.ts`,
  `src/app/admin/vendor-table.tsx` (client toggle). Admin nav entry shown only
  to admins in `dashboard/layout.tsx` (or a link on the dashboard).

## B2. Event tracking → click rate (`migration 0005`)

- **`events` table**: `id uuid pk`, `vendor_id uuid null references vendors`,
  `type text not null`, `metadata jsonb not null default '{}'`,
  `created_at timestamptz default now()`. Index on `(type, created_at)`.
- **RLS**: `events_public_insert FOR INSERT WITH CHECK (true)` (like orders —
  anyone may log); `events_admin_select FOR SELECT USING (public.is_admin(...))`.
  No public read.
- **`logEvent(type, metadata?)` Server Action** (`src/app/actions/events.ts`):
  Zod-validate `type` against an allowlist (`landing_cta`, `upgrade_cta`); insert
  via the normal server client (RLS allows insert). Fire-and-forget; never throws
  to the caller.
- **Instrument**: landing "Get started" CTA (`landing_cta`) and the
  `/dashboard/plan` "Contact us to upgrade" button (`upgrade_cta`) — both become
  small client components that call `logEvent` then proceed.
- **Admin events panel**: counts by type (total + last 7d) and a derived
  **click rate** = `upgrade_cta` clicks vs pro conversions. Aggregation in
  `admin-stats.ts`.

## Cross-cutting

- **Migrations 0003 (pending), 0004, 0005** all need applying to hosted + local.
  0003 hasn't been run yet — instructions provided; run all three in order.
- **Security**: admin authz = RLS (`is_admin()`), server gate (`requireAdmin`),
  and service-role confined to Server Actions. Non-admins get 404. No admin data
  reaches a non-admin client.
- **Testing**: `admin-stats.test.ts` (pure aggregation); `pnpm check` 0, all
  tests pass, `build` clean per subsystem.

## Out of scope

Stripe billing, the loyalty/customer-data subsystem, per-page analytics beyond
the two CTA events, admin editing of vendor data other than plan.
