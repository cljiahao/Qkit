# db

## Purpose

Static tests that assert on the text of a specific `supabase/migrations/*.sql`
file — no real database connection required, unlike the
`*.integration.test.ts` files in the parent `test/` folder which hit a live
Supabase instance. Each file here corresponds 1:1 to one migration, so a
future edit to that migration's SQL is caught even without `RUN_DB_TESTS`.

## Contents

- `vendor-profile-backfill.test.ts` — asserts migration
  `0054_vendor_profile_backfill.sql` backfills `merqo.vendor_profile` from
  `qkit.vendors` (`name`/`social_links`), is idempotent
  (`ON CONFLICT (vendor_id) DO UPDATE`), and only overwrites `social_links`
  when the existing row is still the empty default (`'{}'::jsonb`) — never
  clobbering a value already set through the new write path.
- `drop-vendor-identity-columns.test.ts` — asserts migration
  `0069_drop_vendor_identity_columns.sql` drops the now-stale `name` and
  `social_links` columns from `qkit.vendors`.
- `get-booth-for-order-vendor-profile-social-links.test.ts` — asserts
  migration `0070_get_booth_for_order_vendor_profile_social_links.sql`
  updates `qkit.get_booth_for_order` to resolve `social_links` from
  `merqo.vendor_profile` (not the dropped `qkit.vendors` column), and that
  the cross-schema read is guarded (`information_schema` check) so a fresh
  qkit-only CI/local DB without the `merqo` schema doesn't hard-fail.
- `drop-stale-local-feedback-support.test.ts` — asserts migration
  `0073_drop_stale_local_feedback_support.sql` deletes stale
  vendor-sourced `qkit.feedback` rows, drops the dead `nps` column, and
  drops the fully-superseded local `qkit.support_messages` table.

## Connectivity

Each test reads its migration file straight off disk via
`readFileSync`/`fileURLToPath` (relative to `supabase/migrations/`) and
regex-matches the expected SQL — no vitest DB setup, no `RUN_DB_TESTS` gate.
Companion to `order-numbering.integration.test.ts` and
`vendor-profile-cross-schema.integration.test.ts` in the parent `test/`
folder, which verify the _runtime_ behavior these migrations enable against
a live database.

## Parent

[test](../README.md)
