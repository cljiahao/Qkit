-- One-time copy of qkit's existing local vendor identity (name,
-- social_links) into the shared merqo.vendor_profile table (merqo migration
-- 0009, must already be applied — see
-- docs/superpowers/plans/2026-07-16-shared-vendor-profile.md Task 1 Step 5).
--
-- Self-healing, not a blind ON CONFLICT DO NOTHING: the lazy-create path in
-- get_or_create_vendor_profile can race ahead of this backfill (any vendor
-- touching a dashboard page, or a customer viewing that vendor's
-- order-status page, before this migration runs) and insert an empty
-- merqo.vendor_profile row (social_links = '{}') first. A plain DO NOTHING
-- would then permanently skip that vendor and silently lose their real
-- qkit.vendors.social_links forever. The DO UPDATE below repairs exactly
-- that case — it only overwrites social_links when the existing row is
-- still the empty default AND qkit actually has real data to offer — so
-- it never clobbers a value a vendor may have already set through the new
-- shared-profile write path (upsert_vendor_profile / updateSocialLinks).
-- Safe to re-run either way.
--
-- Old qkit.vendors columns are dropped in a LATER, separate migration once
-- the code swap (Tasks 4-6) is deployed and verified — not here, see design
-- spec's qkit-cutover section step 4.
insert into merqo.vendor_profile (vendor_id, stall_name, social_links)
select id, name, social_links from qkit.vendors
on conflict (vendor_id) do update
  set social_links = excluded.social_links
  where merqo.vendor_profile.social_links = '{}'::jsonb
    and excluded.social_links <> '{}'::jsonb;
