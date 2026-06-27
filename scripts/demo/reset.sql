-- Demo reset — wipe the fixed demo vendor so every recording starts identical.
-- Run against LOCAL Supabase only (never prod):
--   psql "$(pnpm exec supabase status -o env | grep DB_URL | cut -d= -f2-)" -f scripts/demo/reset.sql
-- (or use the DB URL printed by `pnpm exec supabase status`).
--
-- The recorder (record.mjs) registers this exact email live on camera, so the
-- account must not already exist. Deleting it leaf-up clears the whole tree even
-- if a FK isn't ON DELETE CASCADE.

do $$
declare
  demo_uid uuid;
begin
  select id into demo_uid from auth.users where email = 'demo-cart@qkit.local';
  if demo_uid is null then
    raise notice 'No demo account present — nothing to reset.';
    return;
  end if;

  delete from public.orders
    where booth_id in (select id from public.booths where vendor_id = demo_uid);
  delete from public.booths where vendor_id = demo_uid;
  delete from public.vendors where id = demo_uid;
  delete from auth.users where id = demo_uid;

  raise notice 'Demo account % wiped.', demo_uid;
end $$;
