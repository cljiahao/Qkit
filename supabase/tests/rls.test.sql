-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Guards the single most important invariant: a vendor can never read or mutate
-- another vendor's booths or orders. Runs in ONE rolled-back transaction with
-- inline fixtures (fixed UUIDs), so there's no shared state and no cleanup.
--
-- Why pgTAP and not Playwright: this is a database-policy assertion, not a user
-- flow. pgTAP runs in-DB with transaction isolation — fast, deterministic, no
-- app/browser boot. (Supabase's official RLS-testing path.)

begin;
select plan(8);

-- ── Fixtures (created as the superuser test role → RLS bypassed here) ─────────
-- Two vendors, each with one INACTIVE booth (inactive so the public-read policy
-- can't expose them) and one order.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-b@test.local');

insert into public.vendors (id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'Vendor A'),
  ('00000000-0000-0000-0000-00000000000b', 'Vendor B');

insert into public.booths (id, vendor_id, name, is_active)
values
  ('00000000-0000-0000-0000-0000000b0001',
   '00000000-0000-0000-0000-00000000000a', 'A Booth', false),
  ('00000000-0000-0000-0000-0000000b0002',
   '00000000-0000-0000-0000-00000000000b', 'B Booth', false);

insert into public.orders
  (id, booth_id, order_number, customer_name, items, total_cents)
values
  ('00000000-0000-0000-0000-00000000d001',
   '00000000-0000-0000-0000-0000000b0001', 'A-001', 'Cust', '[]'::jsonb, 500),
  ('00000000-0000-0000-0000-00000000d002',
   '00000000-0000-0000-0000-0000000b0002', 'B-001', 'Cust', '[]'::jsonb, 500);

-- ── RLS is actually enabled on the protected tables ──────────────────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.vendors'::regclass),
  'RLS enabled on vendors');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.booths'::regclass),
  'RLS enabled on booths');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  'RLS enabled on orders');

-- ── Act as Vendor A (authenticated role + JWT claims so auth.uid() = A) ───────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000a',
    'role', 'authenticated'
  )::text,
  true);

-- A sees its own booth and order…
select isnt_empty(
  $$ select 1 from public.booths where id = '00000000-0000-0000-0000-0000000b0001' $$,
  'Vendor A can read its own booth');
select isnt_empty(
  $$ select 1 from public.orders where id = '00000000-0000-0000-0000-00000000d001' $$,
  'Vendor A can read its own order');

-- …but NOT Vendor B's booth or order.
select is_empty(
  $$ select 1 from public.booths where id = '00000000-0000-0000-0000-0000000b0002' $$,
  'Vendor A cannot read Vendor B booth');
select is_empty(
  $$ select 1 from public.orders where id = '00000000-0000-0000-0000-00000000d002' $$,
  'Vendor A cannot read Vendor B order');

-- And cannot mutate B's order: the UPDATE policy's USING clause filters the row
-- out, so zero rows are affected (no error, but no write).
select is(
  (with upd as (
     update public.orders set status = 'ready'
     where id = '00000000-0000-0000-0000-00000000d002'
     returning 1
   )
   select count(*)::int from upd),
  0,
  'Vendor A cannot update Vendor B order');

select * from finish();
rollback;
