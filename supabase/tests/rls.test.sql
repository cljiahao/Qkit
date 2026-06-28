-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Guards the core invariant: a vendor can never read or mutate another vendor's
-- booths, orders, customer feedback, upgrade requests, or licenses. Runs in ONE
-- rolled-back transaction with inline fixtures (fixed UUIDs) — no shared state,
-- no cleanup.
--
-- Why pgTAP and not Playwright: this is a database-policy assertion, not a user
-- flow. pgTAP runs in-DB with transaction isolation — fast, deterministic, no
-- app/browser boot. (Supabase's official RLS-testing path.)

begin;
select plan(22);

-- ── Fixtures (created as the superuser test role → RLS bypassed here) ─────────
-- Two vendors, each with one INACTIVE booth (inactive so the public-read policy
-- can't expose them), one order, one customer review, one upgrade request, and
-- one license.

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

-- One ACTIVE booth for A carrying a payment method — the public-read policy
-- exposes active booths, so anon must be able to read its (secret-free) payment
-- config to render the customer pay panel.
insert into public.booths (id, vendor_id, name, is_active, payment)
values
  ('00000000-0000-0000-0000-0000000b0003',
   '00000000-0000-0000-0000-00000000000a', 'A Active',
   true, '{"kind":"paynow","payee_name":"A","uen":"53312345A"}'::jsonb);

insert into public.orders
  (id, booth_id, order_number, customer_name, items, total_cents)
values
  ('00000000-0000-0000-0000-00000000d001',
   '00000000-0000-0000-0000-0000000b0001', 'A-001', 'Cust', '[]'::jsonb, 500),
  ('00000000-0000-0000-0000-00000000d002',
   '00000000-0000-0000-0000-0000000b0002', 'B-001', 'Cust', '[]'::jsonb, 500);

-- Customer reviews tied to each booth.
insert into public.feedback (id, source, booth_id, rating)
values
  ('00000000-0000-0000-0000-0000000f0001', 'customer',
   '00000000-0000-0000-0000-0000000b0001', 5),
  ('00000000-0000-0000-0000-0000000f0002', 'customer',
   '00000000-0000-0000-0000-0000000b0002', 4);

-- Upgrade requests, one per vendor.
insert into public.purchase_requests (id, vendor_id, kind)
values
  ('00000000-0000-0000-0000-0000000e0001',
   '00000000-0000-0000-0000-00000000000a', 'event'),
  ('00000000-0000-0000-0000-0000000e0002',
   '00000000-0000-0000-0000-00000000000b', 'monthly');

-- Licenses, one per vendor (unlabelled, currently active).
insert into public.licenses (id, vendor_id, valid_from, expires_at)
values
  ('00000000-0000-0000-0000-0000000c0001',
   '00000000-0000-0000-0000-00000000000a', now() - interval '1 day',
   now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000c0002',
   '00000000-0000-0000-0000-00000000000b', now() - interval '1 day',
   now() + interval '1 day');

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'public.booths'::regclass), 'RLS on booths');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS on orders');
select ok((select relrowsecurity from pg_class where oid = 'public.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'public.purchase_requests'::regclass), 'RLS on purchase_requests');
select ok((select relrowsecurity from pg_class where oid = 'public.licenses'::regclass), 'RLS on licenses');

-- ── Act as Vendor A (authenticated role + JWT claims so auth.uid() = A) ───────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000a',
    'role', 'authenticated'
  )::text,
  true);

-- Booths + orders.
select isnt_empty(
  $$ select 1 from public.booths where id = '00000000-0000-0000-0000-0000000b0001' $$,
  'A reads its own booth');
select is_empty(
  $$ select 1 from public.booths where id = '00000000-0000-0000-0000-0000000b0002' $$,
  'A cannot read B booth');
select isnt_empty(
  $$ select 1 from public.orders where id = '00000000-0000-0000-0000-00000000d001' $$,
  'A reads its own order');
select is_empty(
  $$ select 1 from public.orders where id = '00000000-0000-0000-0000-00000000d002' $$,
  'A cannot read B order');
-- A data-modifying CTE must attach to the TOP-LEVEL statement, so the WITH
-- leads the `select is(...)` (it can't sit inside a scalar subquery).
with upd as (
  update public.orders set status = 'ready'
  where id = '00000000-0000-0000-0000-00000000d002' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B order');

-- Payment confirmation rides the same orders update policy: A confirms its own
-- order's payment, but never B's.
with upd as (
  update public.orders set payment_status = 'confirmed', paid_at = now()
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is(
  (select count(*)::int from upd),
  1, 'A can confirm payment on its own order');
with upd as (
  update public.orders set payment_status = 'confirmed'
  where id = '00000000-0000-0000-0000-00000000d002' returning 1)
select is(
  (select count(*)::int from upd),
  0, 'A cannot confirm payment on B order');

-- Customer feedback: A sees only its own booths' reviews.
select isnt_empty(
  $$ select 1 from public.feedback where booth_id = '00000000-0000-0000-0000-0000000b0001' $$,
  'A reads its own booth feedback');
select is_empty(
  $$ select 1 from public.feedback where booth_id = '00000000-0000-0000-0000-0000000b0002' $$,
  'A cannot read B booth feedback');

-- Upgrade requests: A sees only its own, and cannot file one as B.
select isnt_empty(
  $$ select 1 from public.purchase_requests where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own upgrade request');
select is_empty(
  $$ select 1 from public.purchase_requests where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B upgrade request');
select throws_ok(
  $$ insert into public.purchase_requests (vendor_id, kind)
     values ('00000000-0000-0000-0000-00000000000b', 'event') $$,
  null,
  'A cannot file an upgrade request as B');

-- set_license_label: only the owner's label changes.
select set_license_label('00000000-0000-0000-0000-0000000c0001', 'Event A');
select is(
  (select label from public.licenses where id = '00000000-0000-0000-0000-0000000c0001'),
  'Event A', 'A can label its own license');
-- A attempts to label B's license — the function's ownership filter no-ops it.
select set_license_label('00000000-0000-0000-0000-0000000c0002', 'Hacked');

reset role; -- back to the superuser test role to verify B's row is untouched
select is(
  (select label from public.licenses where id = '00000000-0000-0000-0000-0000000c0002'),
  null, 'B license label is unchanged by A');

-- ── Act as an anonymous customer (anon role, no auth.uid()) ──────────────────
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true);

-- The active booth's payment config is publicly readable (drives the pay panel).
select is(
  (select payment->>'kind' from public.booths
   where id = '00000000-0000-0000-0000-0000000b0003'),
  'paynow', 'anon reads active booth payment config');

-- But anon can never flip an order to a paid/confirmed state directly — only
-- the owning vendor (via the authenticated update policy) can.
with upd as (
  update public.orders set payment_status = 'confirmed'
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is(
  (select count(*)::int from upd),
  0, 'anon cannot confirm payment on any order');

reset role;

select * from finish();
rollback;
