-- supabase/migrations/0069_drop_vendor_identity_columns.sql
-- Finishes the shared-vendor-profile cutover (see
-- docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md,
-- deferred step 4 of merqo/docs/superpowers/plans/2026-07-16-shared-vendor-profile.md).
-- Stall name + social links have lived in merqo.vendor_profile since the
-- 2026-07-17 cutover (backfilled by migration 0054); these two qkit.vendors
-- columns have been dead weight since then, with one full deploy cycle
-- since passed.
alter table qkit.vendors
  drop column name,
  drop column social_links;
