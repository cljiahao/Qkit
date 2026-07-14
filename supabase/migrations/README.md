# migrations

## Purpose

Ordered SQL schema history for the `qkit` Postgres schema — tables, RLS policies, the realtime publication, and the `order_status` enum. Applied in order via the Supabase CLI.

## Contents

- `0000_create_qkit_schema.sql`
- `0001_initial_schema.sql`
- `0002_booth_images_and_storage.sql`
- `0003_plans_and_booth_limit.sql`
- `0004_admin_role.sql`
- `0005_events.sql`
- `0006_admin_identity_and_audit.sql`
- `0007_booth_hours.sql`
- `0008_atomic_order_numbers.sql`
- `0009_booth_delete_cascade.sql`
- `0010_monetization.sql`
- `0011_pricing_intro.sql`
- `0012_license_amount.sql`
- `0013_indexes.sql`
- `0014_payments_ledger.sql`
- `0015_license_window.sql`
- `0016_booth_serveability.sql`
- `0017_rate_limit.sql`
- `0018_feedback.sql`
- `0019_feedback_nps_and_vendor_read.sql`
- `0020_license_label.sql`
- `0021_purchase_requests.sql`
- `0022_order_timestamps.sql`
- `0023_vendor_tour_seen.sql`
- `0024_booth_payments.sql`
- `0025_booth_access_token.sql`
- `0026_regenerate_booth_token.sql`
- `0027_booth_short_code.sql`
- `0028_stock_counter.sql`
- `0029_get_booth_for_order.sql`
- `0030_place_order.sql`
- `0031_regenerate_short_code.sql`
- `0032_order_integrity.sql`
- `0033_authenticated_lockdown.sql`
- `0034_stock_race.sql`
- `0035_update_policy_with_check.sql`
- `0036_rate_limit_cleanup.sql`
- `0037_booth_images_bucket_limits.sql`
- `0038_entitlement_and_hardening.sql`
- `0039_rls_select_auth_uid.sql`
- `0040_order_status_default.sql`
- `0041_data_api_grants.sql`
- `0042_grant_and_enum_fixes.sql`
- `0043_anon_events_insert.sql`
- `0044_order_token_and_hours.sql`
- `0045_freeze_access_token.sql`
- `0046_booth_open_overnight.sql`
- `0047_support_messages.sql`
- `0048_feedback_order_proof.sql`
- `0049_feedback_booth_index.sql`
- `0050_vendor_board_settings.sql`
- `0051_emit_order_completed.sql`

## Parent

[supabase](../README.md)
