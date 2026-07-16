# tests

## Purpose

pgTAP database tests that guard the core authorization invariant of the whole
app: a vendor can never read or mutate another vendor's data, and the
customer-facing RPCs (`place_order`, `submit_feedback`, `get_booth_for_order`)
behave correctly under RLS and their own internal validation. This is
Postgres-policy testing, not user-flow testing — it runs in-database with
transaction isolation (fast, deterministic, no app/browser boot), which is
Supabase's official RLS-testing approach and is why it's a separate suite
from the Vitest/Playwright tests elsewhere in the repo.

## Contents

- `rls.test.sql` — a single pgTAP file (`plan(79)`, run inside one rolled-back
  transaction with inline fixed-UUID fixtures — no shared state, no cleanup).
  What it actually asserts, by section:
  - RLS is enabled on `vendors`, `booths`, `orders`, `feedback`,
    `purchase_requests`, `support_messages`, `licenses`.
  - `qkit.order_item_quantities` pools and clamps quantities per menu item
    (negative lines clamp to 0; net-zero items are dropped) — the shared
    helper behind the stock-race fix (migration `0034`).
  - `qkit.vendor_entitled`/`can_create_booth` honor `valid_from` (a
    future-dated pass does not count yet) — migration `0038`'s fix.
  - `qkit.booth_open` correctly gates null/daily/weekly windows, including the
    overnight-carry fix from migration `0046` (a Fri 22:00-02:00 shift stays
    open into Saturday).
  - **As vendor A** (`authenticated` role, JWT `sub` set): reads its own
    booth/order but not vendor B's; cannot UPDATE B's order; can confirm
    payment on its own order but not B's; the column-freeze trigger blocks
    changing `total_cents`/`items`/`booth_id`/`access_token` on an existing
    order (`ORDER_IMMUTABLE_COLUMN`) while status/`ready_at` remain writable;
    the `orders_vendor_update` policy carries a `WITH CHECK`.
  - **Authenticated-role lockdown** (migration `0033`): a logged-in
    non-owner cannot read another vendor's servable booth, cannot INSERT
    into `orders` or `feedback` directly, and cannot EXECUTE
    `next_order_number` — closing paths that were closed for `anon` but not
    yet for any authenticated attacker.
  - Plan self-escalation is blocked (`UPDATE vendors SET plan='pro'` fails)
    while a legitimate self-edit (`name`) still works; booth re-pointing to
    another vendor is blocked by `WITH CHECK`; feedback/upgrade-request/
    support-message RLS scopes each vendor to its own rows and blocks filing
    as another vendor; `set_license_label` only affects the caller's own
    license.
  - **As anon** (no `auth.uid()`): cannot SELECT `booths` directly (the only
    public read is `get_booth_for_order`), cannot confirm payment on any
    order, but CAN insert an analytics `events` row (a positive assertion
    guarding against a repeat of migration `0041`'s accidental regression).
  - The full `place_order` order path: direct INSERT into `orders` is closed;
    `get_booth_for_order` strips `cost_cents` and never exposes `short_code`;
    a valid cart succeeds and inserts exactly one row; an idempotent replay
    with the same key returns the same `order_number` without a second
    insert; an unknown short code raises `ORDER_EXPIRED`; an over-cap single
    line and two separate lines of the same capped item that sum over the
    cap both raise `ORDER_SOLD_OUT`; a negative-quantity line can't mask an
    oversell; item name/cost are always re-derived from the stored menu
    (never trusting the client); an all-zero-quantity cart is rejected
    (`ORDER_INVALID`); an unknown customization option is rejected; a
    non-servable booth raises `ORDER_UNSERVABLE`; an item with no price set
    stores no `price_cents` key at all (not `0`) and totals the order at
    `0` (migration `0055`).
  - `submit_feedback`: a customer review bound to a real order's
    `(booth_id, order_number, access_token)` succeeds; a mismatched token is
    rejected (`FEEDBACK_UNAUTHORIZED`) — the migration `0048` review-bombing
    fix.

## Connectivity

Run via `supabase test db` (the Supabase CLI's pgTAP runner) against a
database with `supabase/migrations/` already applied. Referenced directly
from the root `AGENTS.md` ("RLS isolation: `supabase/tests/rls.test.sql` via
`supabase test db`") as the authoritative check on the RLS policies defined in
`../migrations/`. Independent of the Next.js app and the Vitest/Playwright
suites — it tests the database layer in isolation.

## Parent

[supabase](../README.md)
