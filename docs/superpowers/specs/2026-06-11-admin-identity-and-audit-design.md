# Separate admin identity + audit log — design

Date: 2026-06-11

## Problem

`is_admin` is currently a flag on `vendors`, so an admin is also a vendor (can
run booths) and admin/test data pollutes metrics. Move to a real-product role
model: admins are a distinct identity with no vendor row, plus an audit log of
admin actions. Safe to break/rebuild — no real vendors in prod yet.

## Decisions (from brainstorming)

- Separate admin identity (admins have **no vendor row**, can't run booths).
- Audit log of admin mutations.
- Least-privilege pass (verify, document).
- **Defer** network/path protection (infra-layer later, e.g. Cloudflare/Vercel).
- Accepted tradeoff: the founder keeps two accounts — an admin-only one, and a
  normal vendor account for testing booths.

## Schema — `migration 0006_admin_identity_and_audit.sql`

```sql
-- Admin membership lives here, not on vendors.
CREATE TABLE public.admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Carry over anyone already flagged admin, then drop the flag.
INSERT INTO public.admins (user_id)
  SELECT id FROM public.vendors WHERE is_admin = true
  ON CONFLICT DO NOTHING;

-- Redefine is_admin() to read the new table (all RLS using it keeps working).
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = p_uid);
$$;

ALTER TABLE public.vendors DROP COLUMN is_admin;

-- Audit log of admin mutations.
CREATE TABLE public.admin_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target_id  UUID,
  detail     JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

-- Admins read both; writes happen through the service-role client in actions.
CREATE POLICY "admins_admin_select" ON public.admins
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "admin_audit_admin_select" ON public.admin_audit
  FOR SELECT USING (public.is_admin(auth.uid()));
```

No public/self insert policies on `admins`/`admin_audit` — membership and audit
rows are written only via the service-role client (Server Actions / SQL).

## Types — `src/lib/types.ts`

- Remove `is_admin` from `vendors` Row/Insert/Update.
- Add `admins` and `admin_audit` table types + `Admin` / `AdminAudit` aliases.

## Role model & routing

- `requireAdmin()` (`src/lib/admin.ts`): get the user; check `admins` membership
  via a SECURITY DEFINER-backed query (or direct select under admin RLS); not an
  admin → `notFound()`. Returns the `User` (no vendor needed).
- `isAdmin(userId)` helper for routing checks.
- **Admins never enter the vendor app**:
  - `src/app/admin/layout.tsx` (new): `requireAdmin()` guard + minimal admin
    chrome (title + sign out). All `/admin/*` inherit it.
  - `dashboard/layout.tsx`: if the signed-in user is an admin → `redirect("/admin")`
    (admins don't use the vendor dashboard). Remove the old `is_admin` nav link.
  - `onboarding/page.tsx`: admin → `redirect("/admin")` (never create a vendor).
- Vendors are unaffected — no vendor is an admin anymore.

## Audit log

- `setVendorPlan` writes an `admin_audit` row (`action: "set_plan"`,
  `target_id: vendorId`, `detail: { to: plan }`) via the service-role client,
  using the admin id from `requireAdmin()`.
- `/admin` shows a recent-activity list (last ~10 audit rows).

## Metrics simplification

Admins have no vendor row now, so the earlier admin-exclusion filtering in
`admin/page.tsx` is removed — vendor/booth/order counts are simply all rows.
`vendor-table.tsx` drops the `is_admin` column/badge.

## Least-privilege (verify + document)

- Only admin mutation is `setVendorPlan`. Service-role client used solely inside
  Server Actions. `is_admin()` only widens SELECT. Documented here; no code beyond
  confirming.

## Rollout

Apply `0006` to hosted + local. Re-grant yourself admin:
`insert into public.admins (user_id) values ('<your-user-id>');`
Create a separate normal vendor account for booth testing.

## Files

- `supabase/migrations/0006_admin_identity_and_audit.sql` (new)
- `src/lib/types.ts`
- `src/lib/admin.ts` (admins-table check, audit helper)
- `src/app/admin/layout.tsx` (new), `admin/page.tsx`, `admin/actions.ts`,
  `admin/vendor-table.tsx`
- `src/app/dashboard/layout.tsx`, `src/app/onboarding/page.tsx`

## Testing

- Existing `admin-stats.test.ts` still valid (no `is_admin` dependency).
- Gate: `pnpm check` 0, all tests pass, `build` clean.
- Manual (after 0006): admin account → lands on `/admin`, can't reach vendor
  dashboard/onboarding; plan change appears in audit; a vendor account never sees
  `/admin` (404).

## Out of scope

Network/IP/SSO protection, multi-role users, granular permissions, Stripe.
