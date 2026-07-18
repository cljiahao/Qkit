# seed

## Purpose

Demo and CI seed data — sample booths/menus for local development, the
demo-video recorder, e2e tests, and CI's auth bootstrap. None of these run
automatically via `supabase db reset`'s seed hook (`config.toml` points at
`./seed.sql`, which doesn't exist here) — every script in this folder is run
manually and is explicitly idempotent (`on conflict ... do update/nothing`)
so it's safe to re-run.

## Contents

- `ci-auth-bootstrap.sql` — creates the fixed-UUID `auth.users` row
  (`6df824a1-...`, email `e2e-test@qkit.local`) and its matching
  `qkit.vendors` row (name "Test") that the other local seed scripts assume
  already exists. Needed only in CI, where a fresh `supabase start` database
  has no such user (a local dev DB already has the developer's real "Test"
  vendor from normal sign-up).
- `coffee-cart.sql` — seeds one active booth ("Kopitiam Cart") under the
  existing "Test" vendor with 3 customizable drinks (Kopi/Teh/Milo, each with
  style/temperature/sugar option groups) and a fixed e2e-only `short_code`
  (`e2eKopitiam01`) so `e2e/*.spec.ts` can navigate to `/o/e2eKopitiam01`
  deterministically; also wires a PayNow payment method (UEN) so the payment
  panel and payment-queue e2e specs have something to render. Kopi/Teh's
  milk-style choices demonstrate the price/cost-delta and allergen tagging
  features (2026-07-18): "C"/"Normal" are tagged `dairy`, an added "Oat Milk"
  choice carries `price_delta_cents:100`/`cost_delta_cents:40`; Milo is
  tagged `dairy`/`soy` at the item level (no milk-style group to vary it —
  the fixed-ingredient half of the allergen model).
- `coffee-cart-prod.sql` — the same Kopitiam Cart booth, parameterized for a
  hosted (production) Supabase project: the operator replaces
  `__VENDOR_ID__` with their own auth-user UID and runs it in the Supabase
  SQL Editor; upserts the vendor row (no-op if already onboarded) then the
  booth.
- `demo-two-booths.sql` — a richer local demo dataset: upserts the "Test"
  vendor onto the `pro` plan (to lift the 1-booth free cap), deletes that
  vendor's existing booths (orders cascade-delete per migration `0009`), then
  re-inserts two active booths — "Kopitiam Cart" (PayNow-enabled, same
  Oat Milk/dairy tagging as `coffee-cart.sql`) and an "Ice Cream Cart"
  (queue-only, no payment method) — for demo-video recording and manual
  multi-booth testing. The Ice Cream Cart's multi-select "Toppings" group
  is a second, independent allergen example — "Peanuts" tagged `nuts`,
  "Wafer" tagged `gluten` — showing the tagging works on `multiple:true`
  groups too. Explicitly never run via `db reset`.
- `demo-two-booths-prod.sql` — the production variant: takes a single
  `__VENDOR_ID__` placeholder (the operator's own account), upgrades that
  account to `pro`, and replaces only that vendor's own booths — safe against
  a real project since it never touches `auth.users`.

## Connectivity

Run manually against a local (`supabase start`) or hosted Supabase instance,
after `supabase/migrations/` has been applied — e.g.
`docker exec -i supabase_db_qkit psql -U postgres -d postgres < supabase/seed/coffee-cart.sql`.
`ci-auth-bootstrap.sql` runs first in CI (before `coffee-cart.sql`) since the
latter's booth insert has a FK dependency on the vendor it creates. The
`coffee-cart.sql` seed's "Kopitiam Cart" booth and its `e2eKopitiam01` short
code are a hard dependency of `e2e/customer-order.spec.ts` (see the root
`AGENTS.md` E2E instructions). The `/seed/*.svg` banner images referenced by
these scripts ship with the app under `public/`, so they resolve without any
upload step, including on a deployed prod site.

## Parent

[supabase](../README.md)
