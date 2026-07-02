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
select plan(62);

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

-- Vendor C also holds a FUTURE-dated pass (starts tomorrow) — used to prove the
-- entitlement predicate honours valid_from (0038): it must NOT count yet.
insert into public.licenses (id, vendor_id, valid_from, expires_at)
values (
  '00000000-0000-0000-0000-0000000c0003',
  '00000000-0000-0000-0000-00000000000c',
  now() + interval '1 day', now() + interval '2 day');

insert into public.booths (id, vendor_id, name, is_active, short_code, menu_items)
values (
  '00000000-0000-0000-0000-0000000b0004',
  '00000000-0000-0000-0000-00000000000c',
  'C Order Booth', true, 'rlstestcode1',
  '[
     {"id":"cap1","name":"Capped Bun","description":"","price_cents":500,
      "cost_cents":200,"available":true,"stock":2},
     {"id":"free1","name":"Unlimited Tea","description":"","price_cents":300,
      "cost_cents":100,"available":true},
     {"id":"free2","name":"No-Cost Snack","description":"","price_cents":100,
      "available":true}
   ]'::jsonb
);

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'public.booths'::regclass), 'RLS on booths');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS on orders');
select ok((select relrowsecurity from pg_class where oid = 'public.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'public.purchase_requests'::regclass), 'RLS on purchase_requests');
select ok((select relrowsecurity from pg_class where oid = 'public.licenses'::regclass), 'RLS on licenses');

-- ── Shared stock-quantity rule (0034 / T4 + R4) ──────────────────────────────
-- order_item_quantities is the single source the gate and the counter both use:
-- pool per menu item, clamp each line to >= 0, drop items that net to 0.
select is(
  (select qty from public.order_item_quantities(
     '[{"menuItemId":"x","quantity":2},
       {"menuItemId":"x","quantity":-5},
       {"menuItemId":"x","quantity":1}]'::jsonb)
   where menu_item_id = 'x'),
  3, 'order_item_quantities pools and clamps per line (2 + 0 + 1 = 3)');
select is_empty(
  $$ select 1 from public.order_item_quantities(
       '[{"menuItemId":"y","quantity":0},
         {"menuItemId":"y","quantity":-3}]'::jsonb) $$,
  'order_item_quantities drops an item whose lines net to 0');

-- ── Shared entitlement predicate honours valid_from (0038 / T25) ─────────────
-- A holds an active license (valid_from past, expires future) → entitled.
select ok(
  public.vendor_entitled('00000000-0000-0000-0000-00000000000a'),
  'vendor_entitled true for an active license');
-- C holds only a FUTURE-dated pass → not entitled yet (the valid_from fix; the
-- old expires-only predicate would have counted it).
select ok(
  NOT public.vendor_entitled('00000000-0000-0000-0000-00000000000c'),
  'vendor_entitled false for a future-dated license');
-- …and the create-cap agrees: C already has a booth and isn't entitled, so it
-- cannot create another (the old can_create_booth would have allowed it).
select ok(
  NOT public.can_create_booth('00000000-0000-0000-0000-00000000000c'),
  'can_create_booth false for a future-dated pass holder with a booth');

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

-- ── Authenticated-role lockdown (0033) ──────────────────────────────────────
-- Phase A closed these for anon only; sign-up is open, so `authenticated` is
-- attacker-reachable. A is a logged-in vendor that does NOT own Vendor C's
-- servable booth b0004. Every direct path must be denied for A too.
-- booths_public_read is dropped → A cannot read another vendor's servable booth
-- (this was the cost_cents + short_code cross-vendor leak).
select is_empty(
  $$ select 1 from public.booths where id = '00000000-0000-0000-0000-0000000b0004' $$,
  'authenticated non-owner cannot read another vendor''s servable booth');
-- orders_public_insert is dropped + INSERT revoked → no forged orders.
select throws_ok(
  $$ insert into public.orders
       (booth_id, order_number, customer_name, items, total_cents)
     values
       ('00000000-0000-0000-0000-0000000b0004', 'H-001', 'Mallory', '[]'::jsonb, 0) $$,
  null,
  'authenticated cannot INSERT into orders directly');
-- feedback_public_insert is dropped + INSERT revoked → no forged reviews.
select throws_ok(
  $$ insert into public.feedback (source, booth_id, rating)
     values ('customer', '00000000-0000-0000-0000-0000000b0004', 1) $$,
  null,
  'authenticated cannot INSERT into feedback directly');
-- next_order_number EXECUTE revoked from authenticated → cannot burn order_seq.
select throws_ok(
  $$ select public.next_order_number('00000000-0000-0000-0000-0000000b0004'::uuid) $$,
  null,
  'authenticated cannot EXECUTE next_order_number');

-- ── UPDATE-policy WITH CHECK + plan-escalation (0035 / T7) ──────────────────
-- Free→pro escalation: `plan` lives on the vendor's own row, so before the
-- column revoke a vendor could set it directly. UPDATE(plan) is now revoked from
-- authenticated (only the service-role admin action writes it).
select throws_ok(
  $$ update public.vendors set plan = 'pro'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  null,
  'authenticated vendor cannot self-escalate plan to pro');
-- A legitimate self-edit (name) still works — the revoke is column-scoped.
select lives_ok(
  $$ update public.vendors set name = 'Vendor A2'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  'vendor can still update its own name');
-- WITH CHECK now blocks re-pointing an owned booth to another vendor (the USING
-- filter passes since A owns it; the result row would belong to B).
select throws_ok(
  $$ update public.booths set vendor_id = '00000000-0000-0000-0000-00000000000b'
     where id = '00000000-0000-0000-0000-0000000b0001' $$,
  null,
  'vendor cannot re-point its own booth to another vendor (WITH CHECK)');
select isnt(
  (select with_check from pg_policies
   where tablename = 'vendors' and policyname = 'vendors_self_update'),
  null, 'vendors_self_update has a WITH CHECK clause');
select isnt(
  (select with_check from pg_policies
   where tablename = 'booths' and policyname = 'booths_vendor_update'),
  null, 'booths_vendor_update has a WITH CHECK clause');
select isnt(
  (select with_check from pg_policies
   where tablename = 'purchase_requests' and policyname = 'purchase_requests_admin_update'),
  null, 'purchase_requests_admin_update has a WITH CHECK clause');

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

-- ── place_order RPC hardening (0033) ─────────────────────────────────────────
-- V2 (name re-derived from the stored menu) + T2 (cost_cents omitted for a
-- no-cost item). Order free2 with a FORGED item name; the persisted item must
-- carry the menu's name and no cost_cents key.
select lives_ok(
  $$ select public.place_order(
       'rlstestcode1', 'Gil',
       '[{"menuItemId":"free2","name":"FORGED","price_cents":999,"quantity":1}]'::jsonb,
       '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'place_order accepts a no-cost item');
select is(
  (select items->0->>'name' from public.orders
   where idempotency_key = '22222222-2222-2222-2222-222222222222'),
  'No-Cost Snack',
  'place_order re-derives the item name from the stored menu (V2)');
select ok(
  (select not (items->0 ? 'cost_cents') from public.orders
   where idempotency_key = '22222222-2222-2222-2222-222222222222'),
  'place_order omits cost_cents for a no-cost item (T2)');

-- V6: a cart whose only line is quantity 0 prices to nothing → rejected (would
-- otherwise burn an order number on a real $0 order).
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Hana',
       '[{"menuItemId":"free2","name":"No-Cost Snack","quantity":0}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_INVALID%',
  'place_order rejects an all-zero-quantity cart (V6)');

-- V3: an option not present in the item's option groups is rejected (free2 has
-- no option groups, so any option is unknown).
select throws_like(
  $$ select public.place_order(
       'rlstestcode1', 'Ivy',
       '[{"menuItemId":"free2","name":"No-Cost Snack","quantity":1,
          "options":[{"group":"Ghost","choice":"None"}]}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_INVALID%',
  'place_order rejects an option not in the item''s option groups (V3)');

-- submit_feedback: the only feedback insert path (public policy dropped). An
-- anonymous customer review lands.
select lives_ok(
  $$ select public.submit_feedback('customer',
       '00000000-0000-0000-0000-0000000b0004'::uuid, null, 5, null, 'Great!') $$,
  'submit_feedback inserts an anonymous customer review');
select is(
  (select count(*)::int from public.feedback
   where booth_id = '00000000-0000-0000-0000-0000000b0004' and message = 'Great!'),
  1, 'submit_feedback wrote exactly one feedback row');

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
