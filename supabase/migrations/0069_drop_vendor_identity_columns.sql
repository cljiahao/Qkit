-- supabase/migrations/0069_drop_vendor_identity_columns.sql
-- Finishes the shared-vendor-profile cutover (see
-- docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md,
-- deferred step 4 of merqo/docs/superpowers/plans/2026-07-16-shared-vendor-profile.md).
-- Stall name + social links have lived in merqo.vendor_profile since the
-- 2026-07-17 cutover (backfilled by migration 0054), but qkit.vendors.name
-- is still written by onboarding (src/app/onboarding/actions.ts) and
-- qkit.vendors.name/social_links are still read raw by four admin pages
-- until the code cutover in this same plan's Task 2 lands. DO NOT apply
-- this migration to any shared/live environment until Task 2 is merged —
-- see that task's final step, which applies this migration as part of the
-- same deploy as the code changes that stop depending on these columns.
ALTER TABLE qkit.vendors
  DROP COLUMN name,
  DROP COLUMN social_links;
