-- One-time copy of qkit's existing local vendor identity (name,
-- social_links) into the shared merqo.vendor_profile table (merqo migration
-- 0009, must already be applied — see
-- docs/superpowers/plans/2026-07-16-shared-vendor-profile.md Task 1 Step 5).
-- ON CONFLICT DO NOTHING makes this safe to re-run. Old qkit.vendors columns
-- are dropped in a LATER, separate migration once the code swap (Tasks 4-6)
-- is deployed and verified — not here, see design spec's qkit-cutover
-- section step 4.
insert into merqo.vendor_profile (vendor_id, stall_name, social_links)
select id, name, social_links from qkit.vendors
on conflict (vendor_id) do nothing;
