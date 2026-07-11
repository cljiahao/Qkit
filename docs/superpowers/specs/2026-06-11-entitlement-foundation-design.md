# Entitlement foundation (plans + hard locks) — design

Date: 2026-06-11

## Problem

Monetize QKit. Beta needs the plan/limit mechanism and the hard locks now;
payment (Stripe) comes later. When a client wants advanced features, the owner
flips their plan to `pro` manually in Supabase.

## Decisions (from brainstorming)

- Model (future): Free + Pro subscription + Event pass. This round builds only
  the **entitlement foundation** — no billing.
- Locks v1: **1 booth on free**, **stats gated** (free = today only).
- **Do NOT cap orders** (orders drive customer capture; that's the future paid
  value — loyalty/data — its own later subsystem).
- Plans flipped manually for beta; design leaves a clean seam for Stripe.

## Schema — `supabase/migrations/0003_plans_and_booth_limit.sql`

```sql
ALTER TABLE public.vendors
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'pro'));
```

Existing rows backfill to `free` via the default. `createVendor` sets no plan →
default applies.

### Booth-limit RLS (the backstop)

`booths_vendor_all` is `FOR ALL`, so its `USING` doubles as the INSERT check and
can't _restrict_ inserts (permissive policies OR together). Split it, and gate
INSERT by plan:

```sql
DROP POLICY "booths_vendor_all" ON public.booths;

CREATE POLICY "booths_vendor_select" ON public.booths
  FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "booths_vendor_update" ON public.booths
  FOR UPDATE USING (vendor_id = auth.uid());
CREATE POLICY "booths_vendor_delete" ON public.booths
  FOR DELETE USING (vendor_id = auth.uid());

-- SECURITY DEFINER avoids "infinite recursion in policy" from reading booths
-- inside a booths policy, and bypasses RLS for the count. search_path pinned.
CREATE OR REPLACE FUNCTION public.can_create_booth(p_vendor uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT
    (SELECT plan FROM public.vendors WHERE id = p_vendor) = 'pro'
    OR (SELECT count(*) FROM public.booths WHERE vendor_id = p_vendor) = 0;
$$;

CREATE POLICY "booths_vendor_insert" ON public.booths
  FOR INSERT WITH CHECK (
    vendor_id = auth.uid() AND public.can_create_booth(auth.uid())
  );
```

`booths_public_read` (SELECT where `is_active`) is left untouched — customer
ordering still works. Vendors now have two permissive SELECT policies (own +
public-active), which OR correctly.

## Plan rules — `src/lib/plan.ts` (pure, tested)

```ts
import type { Plan } from "@/lib/types"; // "free" | "pro"
export const PLAN_LIMITS: Record<
  Plan,
  { maxBooths: number; statsRanges: string[] }
> = {
  free: { maxBooths: 1, statsRanges: ["24h"] },
  pro: { maxBooths: Infinity, statsRanges: ["24h", "7d", "30d"] },
};
export function normalizePlan(value: unknown): Plan; // unknown/undefined -> "free"
export function canAddBooth(plan: Plan, currentBoothCount: number): boolean;
export function allowedStatsRanges(plan: Plan): readonly string[];
```

`normalizePlan` is defensive: if the migration hasn't been applied yet (`plan`
column absent → `undefined`), everything degrades to `free` instead of crashing.

## Types — `src/lib/types.ts`

Add `export type Plan = "free" | "pro";` and `plan` to `vendors` Row (`Plan`),
Insert (`plan?`), Update (`plan?`). `getVendor` already selects `*`, so it picks
up `plan` automatically.

## Gate: 1 booth on free

Three layers (RLS is the real authority):

1. **RLS** — `booths_vendor_insert` above.
2. **Server** — `dashboard/booths/new/page.tsx`: count the vendor's booths; if
   `!canAddBooth(normalizePlan(vendor.plan), count)` → `redirect("/dashboard/plan")`.
3. **UI** — `dashboard/booths/page.tsx`: when over limit, the "New booth" button
   becomes "Upgrade to add booths" linking to `/dashboard/plan`.

`saveBooth` create already returns an error string if RLS denies — unchanged.

## Gate: stats (free = today only)

`dashboard/stats/page.tsx` reads `normalizePlan(vendor.plan)`, computes
`allowedStatsRanges`. If the requested range isn't allowed, clamp to `24h`. Pass
`allowedRanges` to `StatsControls`; disallowed range tabs render **locked** (lock
icon, link to `/dashboard/plan`) instead of switching. RLS already scopes order
data — this is a feature gate, not authorization.

## Plan page — `src/app/dashboard/plan/page.tsx`

Server component: current plan badge + Free-vs-Pro comparison table + a
**"Interested? Contact us"** `mailto:` CTA (no billing yet). This is the beta
demand signal — interested vendors click, owner flips them to `pro` in Supabase.
Add a "Plan" nav link in `dashboard/layout.tsx`.

## Testing

- `src/lib/plan.test.ts`: `canAddBooth` (free 0→true, free 1→false, pro always
  true), `allowedStatsRanges` per plan, `normalizePlan` ("pro"→pro, "free"/
  garbage/undefined→free).
- Gate: `pnpm check` 0, all tests pass, `pnpm build` clean.
- Manual (after applying 0003 to the DB): free vendor can't create a 2nd booth
  (UI + direct nav + raw insert all blocked); flip to `pro` in Supabase → can;
  free stats shows only 24h, 7d/30d locked; plan page renders.

## Rollout

`0003` must be applied to **hosted** (SQL Editor) and **local** (when Docker is
back) — same manual process as before. Until applied, `normalizePlan` keeps the
app working (everyone treated as `free`, but the booth-count RLS gate is absent
so the limit isn't enforced server-side yet).

## Files

- `supabase/migrations/0003_plans_and_booth_limit.sql` (new)
- `src/lib/types.ts` (Plan + vendors.plan)
- `src/lib/plan.ts`, `src/lib/plan.test.ts` (new)
- `src/app/dashboard/booths/new/page.tsx` (server gate)
- `src/app/dashboard/booths/page.tsx` (upgrade button)
- `src/app/dashboard/stats/page.tsx` (clamp range)
- `src/app/dashboard/stats/stats-controls.tsx` (locked tabs)
- `src/app/dashboard/plan/page.tsx` (new)
- `src/app/dashboard/layout.tsx` (nav link)

## Out of scope

Stripe billing, event passes, the loyalty / customer-data subsystem.
