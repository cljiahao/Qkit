# Drop `qkit.vendors.name` / `qkit.vendors.social_links` — Design

**Date:** 2026-07-21
**Status:** Approved, ready for plan.

## Summary

Finishes step 4 of `merqo/docs/superpowers/specs/2026-07-16-shared-vendor-profile-design.md`
("qkit cutover"), explicitly deferred out of
`merqo/docs/superpowers/plans/2026-07-16-shared-vendor-profile.md` pending one
full deploy cycle after the read/write cutover. That cutover shipped and
merged 2026-07-17 (`c0a77cf`); today is 2026-07-21, so the deferred column
drop is in scope.

`qkit.vendors.name` and `qkit.vendors.social_links` are stale — every real
read/write already goes through `merqo.vendor_profile` via
`getOrCreateVendorProfile`/`upsertVendorProfile`
(`src/lib/merqo-vendor-profile.ts`). This spec drops the two columns and
retires every qkit code path that still touches them directly, closing a gap
the original plan didn't audit: **four admin pages and a second vendor
loader (`get-vendor.ts`) read `vendors.name`/`social_links` raw**, outside
the `get-entitlement.ts` overlay the original cutover built.

## Current state (confirmed by full-codebase inventory)

- `src/lib/supabase/get-entitlement.ts` — already overlays
  `vendor.name`/`vendor.social_links` with the merqo profile result after
  reading the raw `vendors` row. Comment explicitly calls the columns "stale
  leftovers... not yet dropped."
- `src/app/onboarding/actions.ts` — `createVendor` is the **only write** to
  `vendors.name` left (`insert({ id: user.id, name: parsed.data.name })`).
  Nothing writes `vendors.social_links` (never had a write path outside the
  pre-cutover profile actions).
- `src/lib/supabase/get-vendor.ts` (`getVendor`/`requireVendor`, used by
  `dashboard/page.tsx` and `onboarding/page.tsx`) — separate `select("*")`
  loader, does **not** run the merqo overlay. Confirmed neither caller reads
  `.name`/`.social_links` from it today, so it has no runtime dependency on
  the columns — only its type needs to stay consistent with the table.
- Four admin call sites read `vendors.name` directly for display, never
  through the overlay: `src/app/admin/page.tsx`, `src/app/admin/vendors/page.tsx`,
  `src/app/admin/vendors/[id]/page.tsx`, `src/app/admin/feedback/page.tsx`,
  plus toast strings built from that data in `src/app/admin/vendor-manage.tsx`.
  These break on column drop unless rerouted.
- `src/lib/types.ts` — `vendors` table's generated `Row`/`Insert`/`Update`
  types carry `name`/`social_links` today; `booths.name`/`booths.social_links`
  are separate, unrelated columns that are explicitly out of scope (per the
  merqo spec, booths keep their own override, never touched).
- `vendors_self_update` RLS policy (`0001_initial_schema.sql`,
  `0035_update_policy_with_check.sql`, `0039_rls_select_auth_uid.sql`) is
  row-scoped (`auth.uid() = id`), not column-scoped — confirmed no policy
  change is needed for the drop.
- `merqo.get_or_create_vendor_profile` (shipped `merqo/supabase/migrations/0009_vendor_profile.sql`)
  has **no ownership check** on its read/create-if-missing path — any
  authenticated caller can fetch any vendor's profile by id. Only
  `merqo.upsert_vendor_profile` enforces `auth.uid() = p_vendor_id` (skipped
  when `auth.uid()` is null, i.e. service-role). This is what makes the admin
  panel's per-vendor read viable without a new RPC.

## Migration

New `supabase/migrations/0069_drop_vendor_identity_columns.sql`:

```sql
ALTER TABLE qkit.vendors
  DROP COLUMN name,
  DROP COLUMN social_links;
```

No RLS/grant changes (see row-scoped policy note above). Regenerate
`src/lib/types.ts`'s `vendors` Row/Insert/Update (or hand-edit) to drop both
fields — `booths.name`/`booths.social_links` are untouched.

## Code changes

### Onboarding (`src/app/onboarding/actions.ts`)

`createVendor` inserts the bare row (`{ id: user.id }`, no `name`), then —
on success or the existing `23505` already-exists path — calls
`getOrCreateVendorProfile(supabase, user.id, parsed.data.name)` so the stall
name typed at signup seeds `merqo.vendor_profile` directly instead of the
now-gone column. `vendorSchema` (the onboarding form's Zod schema) is
unchanged — it validates the input shape, not where it's stored.

### `get-entitlement.ts`

- Drop the dead `if (vendor && !vendor.social_links) vendor.social_links = {}`
  defensive block — the column doesn't exist to be missing.
- Since the generated `Vendor` (Row) type no longer has `name`/`social_links`,
  add `export type VendorWithProfile = Vendor & { name: string; social_links: SocialLinks }`.
  Build it as a new object —
  `{ ...vendor, name: profile.stall_name, social_links: profile.social_links }`
  — instead of mutating `vendor` in place (mutation currently relies on those
  properties existing on the Row type, which they won't anymore).
- Change `loadEntitlement`/`requireEntitledVendor`'s return type from
  `Vendor | null` / `Vendor` to `VendorWithProfile | null` / `VendorWithProfile`.
  Every existing consumer (`dashboard/layout.tsx`, `profile/page.tsx`, the
  booth pages passing `vendorSocialLinks`) keeps reading
  `vendor.name`/`vendor.social_links` unchanged — only the type declaration
  moves.

### `get-vendor.ts`

No logic change. `Vendor`'s type update flows through automatically;
confirmed neither `dashboard/page.tsx` nor `onboarding/page.tsx` reads the
dropped fields from this loader.

### Admin panel

`admin/page.tsx`, `admin/vendors/page.tsx`, `admin/vendors/[id]/page.tsx`,
`admin/feedback/page.tsx` keep their existing `vendors` select for
`plan`/`created_at`/etc., and separately resolve each listed vendor's
`stall_name` via `getOrCreateVendorProfile(supabase, id, null)`, run in
parallel with `Promise.all` over the vendor id list, merged by id into the
list/detail objects (`VendorListItem` and friends) these pages already build.
`admin/vendor-manage.tsx`'s toast strings read from that merged object, so no
separate change needed there once the source object carries the resolved
name.

N parallel RPC calls per admin page load (one per listed vendor) is an
accepted tradeoff — internal, low-traffic tool; no batch-read RPC exists on
the merqo side and building one is not justified for this call volume
(YAGNI, matches the original spec's own reasoning for keeping the cross-schema
surface to exactly two functions).

## Testing

- New migration-SQL test (mirrors `test/db/vendor-profile-backfill.test.ts`'s
  pattern): asserts `0069_drop_vendor_identity_columns.sql` contains
  `drop column name` and `drop column social_links` against `qkit.vendors`.
- `src/app/onboarding/actions.test.ts` (create if it doesn't exist, per the
  existing profile `actions.test.ts` precedent): asserts `createVendor` calls
  `getOrCreateVendorProfile` with the submitted name, and that the bare
  `vendors` insert no longer includes `name`.
- Any existing test mocking `getVendor`/`requireVendor`/`loadEntitlement`
  that constructs a fake `Vendor` row with `name`/`social_links` fields
  updates to the `VendorWithProfile` shape instead (find with
  `grep -rl "loadEntitlement\|requireEntitledVendor\|requireVendor" src --include=*.test.*`).
- Admin page tests (if any exist for the four call sites — check first) get
  their mocks updated to stub the new per-vendor profile fetch alongside the
  existing `vendors` select mock.
- `profile-form.dom.test.tsx` is unaffected — its props are sourced from the
  overlay either way, only the storage underneath moved.

## Out of scope

- Any change to `merqo.vendor_profile`, its RPC functions, or their RLS —
  already shipped and stable (`merqo` migration `0009`).
- `booths.name`/`booths.social_links` — separate columns, never part of this
  cutover.
- A batch-read RPC for the admin panel — accepted N-calls tradeoff (see
  above); revisit only if admin vendor counts grow enough to matter.
- Re-litigating whether one full deploy cycle has actually passed — confirmed
  above (merged 2026-07-17, today 2026-07-21) and the user made the call to
  proceed now.
