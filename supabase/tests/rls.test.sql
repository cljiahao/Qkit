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
select plan(40);

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

-- One ACTIVE booth for A carrying a payment method. Before the order-path hardening this was
-- directly readable by anon; as of 0029 anon's direct booths SELECT is
-- revoked, so this fixture now exists only as an active-but-otherwise-unread
-- booth (kept for column stability / minimal diff — not asserted on directly).
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

-- Vendor C: its OWN single active booth with a known short_code and a
-- stock-capped menu item — used by the order-path RPC tests below
-- (get_booth_for_order / place_order). Being the vendor's only (hence oldest)
-- active booth makes booth_servable() trivially true under the free-plan rule,
-- so these tests don't depend on plan/license fixtures.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-c@test.local');

insert into public.vendors (id, name)
values ('00000000-0000-0000-0000-00000000000c', 'Vendor C');

insert into public.booths (id, vendor_id, name, is_active, short_code, menu_items)
values (
  '00000000-0000-0000-0000-0000000b0004',
  '00000000-0000-0000-0000-00000000000c',
  'C Order Booth', true, 'rlstestcode1',
  '[
     {"id":"cap1","name":"Capped Bun","description":"","price_cents":500,
      "cost_cents":200,"available":true,"stock":2},
     {"id":"free1","name":"Unlimited Tea","description":"","price_cents":300,
      "cost_cents":100,"available":true}
   ]'::jsonb
);

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

-- ── Order integrity (0032) ───────────────────────────────────────────────────
-- Financial/identity columns are frozen after creation (BEFORE UPDATE trigger),
-- and the vendor UPDATE policy now carries a WITH CHECK. A owns order d001;
-- these updates pass the USING filter and reach the freeze trigger, which
-- throws. pgTAP wraps each throws_like in a savepoint, so the outer txn
-- survives and later tests still run.
select throws_like(
  $$ update public.orders set total_cents = 1
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot change total_cents on its own order');
select throws_like(
  $$ update public.orders
       set items = '[{"menuItemId":"x","name":"Forged","quantity":1}]'::jsonb
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot change items on its own order');
select throws_like(
  $$ update public.orders set booth_id = '00000000-0000-0000-0000-0000000b0003'
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot re-point booth_id (frozen; WITH CHECK also guards ownership)');
-- The state machine stays writable: a status advance on the own order succeeds.
with upd as (
  update public.orders set status = 'ready', ready_at = now()
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is((select count(*)::int from upd), 1,
  'vendor can still advance status on its own order');
-- The UPDATE policy actually carries a WITH CHECK (ownership on the result row).
select isnt(
  (select with_check from pg_policies
   where tablename = 'orders' and policyname = 'orders_vendor_update'),
  null, 'orders_vendor_update has a WITH CHECK clause');

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

-- Direct SELECT on booths is closed (0029 — get_booth_for_order is the only
-- public read; it strips cost_cents/short_code and never exposes payment
-- internals). This also supersedes the pre-hardening "anon reads active booth
-- payment config" direct-select test, which the 0029 REVOKE now makes throw.
select throws_ok(
  $$ select 1 from public.booths limit 1 $$,
  null,
  'anon cannot SELECT booths directly');

-- But anon can never flip an order to a paid/confirmed state directly — only
-- the owning vendor (via the authenticated update policy) can.
with upd as (
  update public.orders set payment_status = 'confirmed'
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is(
  (select count(*)::int from upd),
  0, 'anon cannot confirm payment on any order');

-- ── Order-path write path (anon) — migrations 0027–0031 ─────────────────────

-- Direct INSERT into orders is closed (0030); place_order is the only path.
select throws_ok(
  $$ insert into public.orders
       (booth_id, order_number, customer_name, items, total_cents)
     values
       ('00000000-0000-0000-0000-0000000b0004', 'X-999', 'Eve', '[]'::jsonb, 0) $$,
  null,
  'anon cannot INSERT into orders directly');

-- next_order_number is superseded by place_order's own numbering; EXECUTE
-- was revoked from anon in 0030.
select throws_ok(
  $$ select public.next_order_number('00000000-0000-0000-0000-0000000b0004'::uuid) $$,
  null,
  'anon cannot EXECUTE next_order_number');

-- get_booth_for_order: the only public read — public-safe projection only.
select ok(
  (select bool_and(not (mi ? 'cost_cents'))
   from jsonb_array_elements(
     public.get_booth_for_order('rlstestcode1') -> 'menu_items'
   ) as mi),
  'get_booth_for_order strips cost_cents from every menu item');
select ok(
  not (public.get_booth_for_order('rlstestcode1') ? 'short_code'),
  'get_booth_for_order never exposes short_code');

-- place_order: happy path succeeds and inserts exactly one row.
select lives_ok(
  $$ select public.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
       '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'place_order succeeds for a valid cart');
select is(
  (select count(*)::int from public.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  1, 'place_order inserted exactly one row');

-- Replay with the SAME idempotency key must return the SAME order_number and
-- must not insert a second row.
select is(
  (select public.place_order(
     'rlstestcode1', 'Ada',
     '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
     '11111111-1111-1111-1111-111111111111'::uuid) ->> 'order_number'),
  (select order_number from public.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  'place_order replay returns the same order_number');
select is(
  (select count(*)::int from public.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  1, 'place_order replay does not insert a second row');

-- Unknown / rotated-away short_code.
select throws_like(
  $$ select public.place_order(
       'no-such-code', 'Eve', '[]'::jsonb, gen_random_uuid()) $$,
  '%ORDER_EXPIRED%',
  'place_order raises ORDER_EXPIRED for an unknown code');

-- Over-cap single line: cap1 has stock 2, 1 already sold above (remaining 1).
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Bob',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":5}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order raises ORDER_SOLD_OUT for an over-cap single line');

-- Two SEPARATE line entries for the SAME capped item, each individually within
-- the remaining cap (1 each) but SUMMING over it (2 > 1) — the stock gate must
-- aggregate lines by menu item, not check each line in isolation.
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Cara',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1},
         {"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order aggregates duplicate lines for the same item before the stock gate');

-- A negative-quantity line must not net against a positive line to mask an
-- oversell — the aggregate clamps each line to >= 0 before comparing to the
-- remaining cap (qty -10 clamps to 0, so the sum is 5, not -5).
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Dev',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":-10},
         {"menuItemId":"cap1","name":"Capped Bun","quantity":5}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order clamps a negative line instead of letting it mask an oversell');

-- Non-servable booth: flip is_active off (booth_servable gates on it) and
-- confirm place_order refuses with ORDER_UNSERVABLE. Flipped as the superuser
-- test role — anon has no update policy on booths — then re-entered as anon to
-- call place_order, matching the customer-facing path under test.
reset role;
update public.booths set is_active = false
where id = '00000000-0000-0000-0000-0000000b0004';
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true);
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Fay',
       '[{"menuItemId":"free1","name":"Unlimited Tea","quantity":1}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_UNSERVABLE%',
  'place_order raises ORDER_UNSERVABLE for a non-servable booth');

reset role;

select * from finish();
rollback;
