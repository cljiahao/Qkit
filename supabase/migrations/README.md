# migrations

## Purpose

The ordered, append-only SQL schema history for the `qkit` Postgres schema —
every table, RLS policy, SECURITY DEFINER RPC, trigger, index, and Data-API
grant/revoke that defines qkit's data model and its Postgres-enforced
authorization. Applied in filename order via the Supabase CLI; nothing here is
ever edited after landing — a later migration corrects an earlier one.

## Contents

76 files, `0000` through `0075`. Read in full: `0000`, `0001`, `0010`, `0030`,
and the entire `0038`-`0075` tail; skimmed by filename/theme otherwise. The
schema evolved in five broad waves:

- **Foundation (`0000`-`0009`)** — `0000_create_qkit_schema.sql` creates the
  `qkit` schema and grants `USAGE` to `anon`/`authenticated`/`service_role`.
  `0001_initial_schema.sql` creates `vendors`/`booths`/`orders`, the
  `order_status` enum (`pending→confirmed→preparing→ready→completed`, +`cancelled`), the `updated_at` trigger, baseline RLS (vendor-owns-own-row,
  public read of active booths, anyone-can-insert orders), and adds `orders`
  to the `supabase_realtime` publication. `0002`-`0009` add booth image
  storage, the free/pro `plans` + 1-booth free cap, an `admin` role +
  identity/audit table, booth working hours, atomic per-booth order
  numbering, and cascade-delete of orders when a booth is deleted.
- **Monetization (`0010`-`0021`)** — `0010_monetization.sql` adds
  `licenses` (time-boxed Pro passes, RLS-readable by their vendor) and
  `pricing` (single-row, publicly readable admin-editable prices), redefines
  `can_create_booth` to also honor a live license, and adds
  `booth_remaining_stock` (per-item remaining-stock JSONB, SECURITY DEFINER).
  `0011`-`0021` layer on pricing introduction, license amount/window
  (`valid_from` for scheduled passes), booth serveability
  (`booth_servable`), a DB-backed rate limiter, customer feedback +
  vendor-visible NPS, license labels, and vendor upgrade `purchase_requests`.
- **Order-path hardening (`0022`-`0037`)** — order timestamps
  (`ready_at`/`completed_at`), vendor tour/onboarding state, booth BYO
  payment config, a rotating booth access token + short code (closing the
  sequential-booth-id enumeration path), a per-item stock counter, the public
  `get_booth_for_order` read (booth-safe projection, never exposing
  `cost_cents`/`short_code`), `0030_place_order.sql` (the SECURITY DEFINER
  RPC that becomes the _only_ customer order-write path: validates,
  idempotency-checks via a unique `(booth_id, idempotency_key)` index,
  re-prices every line from the stored menu server-side, pools/clamps stock
  across duplicate lines before the sold-out gate, atomically increments
  `order_seq`, and closes the direct `INSERT`/`next_order_number` paths for
  `anon`), then `0031`-`0037` round out short-code regeneration, order
  column-freeze (`ORDER_IMMUTABLE_COLUMN` trigger on financial/identity
  columns), the `authenticated`-role lockdown (closing the same direct-write
  paths for logged-in non-owners, not just `anon`), the shared
  `order_item_quantities` stock-pooling helper, `WITH CHECK` clauses on the
  vendor UPDATE policies (closing plan self-escalation and booth
  re-pointing), rate-limit table cleanup, and booth-image storage bucket
  limits.
- **Entitlement, grants & performance (`0038`-`0043`)** —
  `0038_entitlement_and_hardening.sql` extracts `vendor_entitled` as the
  single predicate both `can_create_booth` and `booth_servable` call (fixing
  a drift where `can_create_booth` ignored `valid_from` and let a
  future-dated pass lift the booth cap early), adds a `payment_method_kind`
  CHECK constraint, and tightens an internal helper's grants.
  `0039_rls_select_auth_uid.sql` rewrites every qkit RLS policy's
  `auth.uid()` calls as `(select auth.uid())` so Postgres evaluates them once
  per query (planner initPlan) instead of once per row — a pure performance
  change, semantics unchanged. `0040` fixes the `orders.status` default to
  `'preparing'` (the value `place_order` actually inserts).
  `0041_data_api_grants.sql` replaces the CLI's auto-expose behavior with
  fully explicit per-role, per-table grants (`authenticated` gets what its
  RLS gates; `anon` gets none — every customer path is a SECURITY DEFINER
  RPC; `service_role` gets everything) — this is the migration that makes
  the Data-API surface deterministic across CLI versions.
  `0042_grant_and_enum_fixes.sql` fixes two bugs the pgTAP suite caught on
  first real run: `plan` was still vendor-updatable because Postgres can't
  carve a column out of a table-level UPDATE grant (fixed via a
  column-scoped grant instead), and `place_order`'s payment-status `CASE`
  expression didn't cast to the enum. `0043` restores `anon` INSERT on
  `events` (landing-page analytics silently broke under `0041`'s explicit
  grants).
- **Order-token, hours, feedback-integrity & social links (`0044`-`0054`)** —
  `0044_order_token_and_hours.sql` adds `orders.access_token` (an
  unguessable per-order UUID closing the sequential-order-number
  enumeration leak on the status page) and `booth_open` (a SQL mirror of
  `src/lib/hours.ts`'s `isBoothOpen`, SGT wall-clock, enforced server-side
  inside `place_order` for the first time). `0045` extends the column-freeze
  trigger to cover `access_token` (it was addable via a direct PATCH before
  this). `0046_booth_open_overnight.sql` fixes `booth_open` to also check
  the _previous_ day's overnight carry (a Fri 22:00-02:00 weekly shift was
  wrongly reported closed after midnight on a day with no window of its
  own). `0047` adds `support_messages` (vendor-to-admin help requests).
  `0048_feedback_order_proof.sql` closes a review-bombing hole:
  `submit_feedback` now requires a customer review's
  `(booth_id, order_number, access_token)` to match a real order, not just a
  length-checked order number. `0049` indexes `feedback` by
  `(booth_id, created_at)` for the vendor stats-reviews query. `0050` adds
  `vendors.board_settings` (per-vendor live-order-board aging/overdue/sound/
  notify preferences, vendor-updatable). `0051_emit_order_completed.sql`
  adds a trigger that calls `merqo.emit_metric` on an order's first
  transition into `completed`, so sibling Merqo-suite products (e.g.
  loopkit) can react to qkit order completions without qkit knowing who's
  listening. `0052_vendor_social_links.sql` adds `vendors.social_links`
  (vendor-wide default) and `booths.social_links` (nullable per-booth
  whole-object override). `0053_booth_for_order_social_links.sql` extends
  `get_booth_for_order` to resolve and return the effective social links
  (booth override, else vendor default) so the customer menu page can show
  them even while the booth is closed. `0054_vendor_profile_backfill.sql`
  is a one-time, self-healing copy of `vendors.name`/`social_links` into the
  shared `merqo.vendor_profile` table (see
  `docs/superpowers/specs/2026-07-16-shared-vendor-profile-design.md` in the
  sibling `merqo` repo) — `ON CONFLICT DO UPDATE ... WHERE` rather than
  `DO NOTHING`, so it repairs a vendor whose profile row was lazily created
  empty by `merqo.get_or_create_vendor_profile` before this migration ran,
  without ever clobbering a value already set through the new shared-profile
  write path — guarded to no-op when `merqo.vendor_profile` doesn't exist
  (qkit's own CI/local `supabase start` builds a fresh DB from only qkit's
  migrations, with no merqo schema at all). `0055_place_order_free_price.sql`
  recreates `place_order` so an unset menu-item price stores no
  `price_cents` key on the order snapshot at all, instead of coalescing to
  `0` — mirrors how `cost_cents` already worked, and is what lets the UI
  show "Free" instead of "$0.00" for a deliberately-unpriced item.
  `0056_place_order_option_deltas.sql` extends the same function's
  options-validation loop to also sum each selected choice's
  `price_delta_cents`/`cost_delta_cents` into the line's total/cost, so a
  vendor can charge extra for a customization (e.g. an oat-milk upcharge)
  while `place_order` stays the sole authority on the charged amount — a
  `price_delta_cents` forged into a submitted option is ignored, only the
  stored menu's own delta is ever trusted. `0057_order_priority_bump.sql`
  adds a nullable `priority_bumped_at` column to `orders` for the vendor
  "bump to front" board action — not caught by the existing freeze
  trigger (denylist, not allowlist), rides the existing
  `orders_vendor_update` RLS policy with no new policy needed.
  `0058_platform_settings.sql` adds `qkit.platform_settings` — a
  public-read singleton (same shape as `qkit.pricing`, `0010`) backing a
  maintenance banner; no UPDATE policy at all, writes go through the
  service-role admin action only. `0059_board_settings_undo_seconds.sql`
  adds `undo_seconds` to `board_settings` (vendor-configurable duration for
  `OrderCard`'s advance-undo affordance) — since `board_settings` is JSONB
  rather than a real column, this both bumps the column `DEFAULT` (future
  inserts) and backfills the key onto every existing row that lacks it
  (`board_settings ? 'undo_seconds'`). `0060_walkup_orders.sql` adds
  `orders.source` (`'qr' | 'walkup'`, default `'qr'`) and
  `qkit.place_walkup_order` — a SECURITY DEFINER RPC for staff-entered
  counter orders. Direct `INSERT` on `orders` stays revoked for everyone
  (`0033`), so this can't reuse `place_order`'s anon/short-code model
  either way; instead it checks `vendor_id = auth.uid()` (same
  ownership-check pattern as `set_license_label`, `0020`) and otherwise
  mirrors `place_order`'s repricing/option-delta/stock-check logic
  verbatim — the money-correctness rules don't change just because staff
  is typing instead of a customer. Deliberately skips `booth_servable`/
  `booth_open`: those gate the customer-facing schedule, not a vendor's
  own staff standing at the counter. `0061_walkup_order_paid_flag.sql`
  adds a `p_paid` argument to `place_walkup_order` so staff who already
  collected payment at the counter (cash, tap-to-pay) can land the order
  with `payment_status = 'confirmed'` in one step, instead of a separate
  "Confirm payment" tap on the board right after — same end state
  `confirmOrderPayment` (`src/app/dashboard/order-actions.ts`) produces.
  A new argument changes the function's signature, so this `DROP FUNCTION`s
  the old 3-arg version explicitly before `CREATE OR REPLACE`, rather than
  leaving it behind as a second, stale overload. `0062_board_settings_
display_options.sql` adds `daily_order_number_reset` (bool, default
  `false`) and `default_prep_minutes` (int, nullable, default `null`) to
  `board_settings` — same JSONB-blob `DEFAULT` bump + per-row backfill
  pattern as `0059`. Both are display-only: `daily_order_number_reset` never
  touches the real `order_number` counter (the board/status page compute a
  day-local rank at read time instead — `displayOrderNumber` in
  `src/lib/orders.ts`), and `default_prep_minutes` only ever feeds a client-
  side wait-estimate fallback (`estimateWaitSeconds` in `src/lib/stats.ts`),
  never anything written back to the database.
  `0063_order_number_no_truncate.sql` fixes a real bug in both `place_order`
  and `place_walkup_order`'s numbering: `lpad(v_seq::text, 4, '0')` doesn't
  just zero-pad, Postgres's `lpad` _truncates_ a string already longer than
  the target length, so a booth's 10000th order got
  `lpad('10000', 4, '0') = '1000'` — colliding with that booth's real order
  #1000 and violating `UNIQUE (booth_id, order_number)` (`0001`'s
  constraint), failing the order outright. Recreates both functions
  verbatim from their current (`0056`/`0061`) bodies with
  `lpad(v_seq::text, greatest(4, length(v_seq::text)), '0')` instead — pads
  short numbers to 4 digits, never shrinks a longer one.
  `qkit.next_order_number` (`0008`) has the same bug but is dead code (its
  EXECUTE grant was revoked from every role in `0041`; `place_order` has
  inlined its own numbering since `0030`), so it's left alone.
  `0064_booth_arrival_confirmation.sql` adds "scan-to-start" arrival
  confirmation: `booths.requires_arrival_confirm` (bool, default `false`),
  and recreates `place_order` (verbatim from its `0063` body otherwise) so a
  new order's initial `status` is `'pending'` instead of a hardcoded
  `'preparing'` when the booth has the flag on — for items made fresh per
  order (e.g. ice cream) where prep shouldn't start until the customer is
  actually at the counter; the customer's own status page then prompts them
  to confirm arrival (`confirmArrival`,
  `src/app/order/[boothId]/[orderNumber]/status-actions.ts`), which flips the
  order to `'preparing'` itself. `place_walkup_order` is deliberately left
  untouched — a vendor keying in a counter order in person has no "customer
  arrives later" to wait for. `0065_ready_auto_clear.sql` adds the
  ready-order auto-clear sweep: `orders.auto_completed` (bool, default
  `false`, set only by `sweepReadyOrders` and cleared only by
  `restoreAutoCompleted` or a fresh manual advance — see
  `src/app/dashboard/order-actions.ts` — so a completed-orders "Restore to
  ready" affordance can tell a sweep-driven completion apart from a vendor's
  own "Mark Picked Up" tap) plus a `ready_auto_clear_min` key added to
  `board_settings`'s `DEFAULT` and backfilled onto every existing vendor row
  (same JSONB-blob pattern as `0059`/`0062`), defaulting to `3` minutes — a
  deliberately conservative default (see the job board's own reasoning
  against the originally-floated 15 seconds) that a vendor can retune (or
  set to `null` to disable the sweep) from `/dashboard/settings`.
  `0066_menu_categories.sql` adds `booths.menu_categories` (jsonb, default
  `[]`): an ordered list of `{id, label}` menu sections. Each `menu_items`
  entry may reference one by `id` via its own `category` key (added
  client-side only, not a DB column — `menu_items` stays a flat jsonb
  array); a stable id means renaming a section never requires rewriting
  every item that references it, and an item with no/unknown category id
  renders in an "Other" bucket, always last. `get_booth_for_order` is
  recreated (verbatim from its `0053` body otherwise) to also return
  `menu_categories`, so the customer menu page can group items by section
  in the same round trip that already fetches the menu. No UI reads or
  writes this column yet (menu-editor, booth-form, customer menu grouping)
  — schema/RPC only. `0067_daily_order_number_reset_default_on.sql` flips
  `daily_order_number_reset`'s column `DEFAULT` from `false` to `true` and,
  unlike every prior JSONB-blob default bump in this history, also
  unconditionally overwrites the key on every existing vendor row (not the
  usual `WHERE NOT (... ? 'key')` backfill guard, since every row already
  has the key by now) — a deliberate product default change, not a missing-
  key backfill: qkit's pop-up/event booths expect a small daily-reset
  ticket number by default, matching e.g. bubble-tea-chain counter
  numbering. Purely display (see `0062`); the real `order_number` is
  untouched. `0068_show_wait_estimate.sql` adds `board_settings
  .show_wait_estimate` (bool, default `true`): an opt-OUT toggle for the
  customer status page's numeric wait estimate — off leaves only the
  queue-position label shown, never a minute guess, regardless of how much
  real order history exists (`getWaitEstimate` in
  `src/app/order/[boothId]/[orderNumber]/status-actions.ts`). Normal
  missing-key backfill (unlike `0067`'s unconditional overwrite) since
  every vendor starts at the same `true` default with nothing to preserve.
  `0069_drop_vendor_identity_columns.sql` drops `qkit.vendors.name` and
  `qkit.vendors.social_links` — dead since the 2026-07-17 shared-vendor-profile
  cutover moved both to `merqo.vendor_profile`, backfilled by `0054`. Every
  remaining raw reader/writer of these two columns (onboarding, four admin
  pages) was cut over to `getOrCreateVendorProfile`/`vendorStallNames` in the
  same change — see
  `docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md`.
  Applied to the shared/live DB 2026-07-22. `0069`'s own review missed one
  more raw reader: `qkit.get_booth_for_order`
  (0053, last redefined by `0066`) still read its vendor-level
  `social_links` fallback straight off `qkit.vendors`.
  `0070_get_booth_for_order_vendor_profile_social_links.sql` redefines it to
  read that fallback from `merqo.vendor_profile` instead — a same-database
  cross-schema `SELECT`, not a new dependency, matching `0054`'s own
  precedent of qkit reading/writing that table directly. Guarded the same
  way as `0054`: qkit's own CI/local `supabase start` builds a fresh
  Postgres from only qkit's migrations, no merqo schema at all, so the read
  is skipped (leaving the fallback `null`) when `merqo.vendor_profile`
  doesn't exist there.
- **Cross-kit convergence (`0071`-`0072`)** — `0071_vendor_feedback_convergence.sql`
  redefines `qkit.submit_feedback`'s vendor branch (`source='vendor'`) to
  call the shared `merqo.submit_vendor_feedback` RPC instead of inserting
  locally, and guard-backfills existing local vendor-NPS rows into
  `merqo.vendor_feedback`; customer feedback is unchanged. See
  `docs/superpowers/specs/2026-07-23-qkit-vendor-feedback-convergence-design.md`.
  `0072_support_messages_convergence.sql` guard-backfills qkit's existing
  local `support_messages` rows into the shared `merqo.support_messages`
  table (new submissions move to the shared RPC in application code, not
  this migration — see `docs/superpowers/specs/2026-07-23-cross-kit-support-messages-remaining-kits-design.md`).
  Both migrations use the same `information_schema` existence guard as
  `0054`/`0070`, since qkit's own isolated CI Postgres has no `merqo`
  schema at all.
  `0073_drop_stale_local_feedback_support.sql` finishes both cutovers: no
  client has shipped against either yet, so unlike `0069`'s deferred
  column drop this lands immediately rather than waiting a deploy cycle —
  deletes the (already-backfilled) `source='vendor'` rows from
  `qkit.feedback` and drops its now-dead `nps` column (customer rows only
  ever used `rating`), and drops `qkit.support_messages` outright (fully
  superseded for both writes and admin reads). `0074_qkit_wedge_pricing.sql`
  lowers `qkit.pricing.monthly_cents` from $24.99 to $14.99 (qkit is the
  family's acquisition wedge, not a standalone premium product — see
  `docs/business/2026-08-15-per-kit-pricing-rationale.md` in the sibling
  `Merqo Business` tree), guarded on the known current value so it never
  clobbers a price an admin has since changed via `/admin`.
- **Cross-kit customer identity (`0075`)** —
  `0075_place_order_customer_phone.sql` gives both `place_order` and
  `place_walkup_order` a new, genuinely optional `p_customer_phone text
DEFAULT NULL` argument — same signature-change treatment as `0061`'s
  `p_paid` addition (`DROP FUNCTION` the old signature first, so
  `CREATE OR REPLACE` can't leave it behind as a stale second overload).
  When a phone is supplied, each function calls the shared
  `merqo.upsert_customer(b.vendor_id, p_customer_phone, p_customer_name)`
  after its own successful order insert, linking the order to the shared
  `merqo.customers` table (merqo migration `0018`) so a repeat customer can
  eventually be recognized across kits for the same vendor — see
  `docs/business/2026-08-16-cross-kit-customer-identity-design.md` in the
  sibling `Merqo Business` tree. Guarded with the same
  `information_schema.routines` existence check as `0071`'s
  `merqo.submit_vendor_feedback` call (qkit's own isolated CI Postgres has
  no `merqo` schema at all), and skipped entirely when the phone is
  null/omitted — no new required column, no backfill, zero added checkout
  friction for a customer who declines to give one.

## Connectivity

Applied via the Supabase CLI (`supabase db push`/`db reset`, or the
project's `/supabase-migrate` skill) against the local or hosted Postgres
instance configured in `../config.toml`. `src/lib/types.ts` is a hand-
maintained mirror of the resulting schema and must be kept in sync by hand
(or via `supabase gen types typescript`) after any migration lands.
`../tests/rls.test.sql` (pgTAP) exercises the RLS policies and RPCs this
history produces. `../seed/*.sql` scripts insert data against the schema
these migrations create, and assume specific functions/columns exist
(e.g. `short_code`, `access_token`, `payment`).

## Parent

[supabase](../README.md)
