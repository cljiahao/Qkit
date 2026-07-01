# Order Integrity — Vendor Write Path Hardening (Phase B / B2) — Design

**Date:** 2026-07-02
**Status:** Approved (A: server actions + DB immutable-column trigger)
**Depends on:** audit findings `docs/superpowers/specs/2026-07-01-project-audit-findings.md` (B2)
**Sibling:** Phase A `2026-07-01-order-path-hardening-design.md` did the same move-enforcement-into-Postgres for the **customer** write path; this does it for the **vendor** write path.

## Problem (B2, confirmed)

The vendor order board (`src/components/order-card.tsx`) mutates orders **directly from the browser** via the Supabase browser client — `advanceStatus`, `confirmPayment`, `cancelOrder` each fire `UPDATE orders …`. The only guard is RLS policy `orders_vendor_update` (`0001:91`), which has a `USING` row filter but **no `WITH CHECK`**.

Two holes:

1. **No `WITH CHECK`** → a vendor UPDATE may re-point `booth_id` to a booth they don't own (ownership theft; the canonical WITH-CHECK bug per Supabase docs). `USING` only decides _which rows_ are visible to update, not what the row may _become_.
2. **No column freeze** → the state machine and money fields live only in browser React. A tampered vendor session — or a direct PostgREST call with the vendor's JWT (skips our app entirely, same class as Phase A's S1) — can set **any** column: `total_cents`, `items` (which carry per-line `price_cents`/`cost_cents`), `order_number`, `customer_name`, `payment_status`.

## Best-practice grounding (researched 2026-07-02, community + official consensus)

- **UPDATE policies need both `USING` and `WITH CHECK`.** Supabase RLS docs: an UPDATE policy without `WITH CHECK` "lets users change the user_id to someone else's UUID, effectively stealing ownership." ([Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [RLS guide](https://designrevision.com/blog/supabase-row-level-security))
- **Column immutability = `BEFORE UPDATE` trigger comparing `OLD`/`NEW`** — the standard `deny_updates`-style pattern. ([PGXN check_updates](https://pgxn.org/dist/check_updates/doc/check_updates.html))
- **Key nuance:** RLS `WITH CHECK` can only see the **NEW** row, not `OLD` — so it can enforce "result must be owned" but _cannot_ express "`total_cents` must equal its prior value." The two layers are therefore complementary, not redundant: `WITH CHECK` stops booth re-pointing; the trigger freezes the money/identity columns.
- **Privileged writes belong server-side.** PostgREST runs client calls under the caller's role with no mid-request escalation → the client is the whole attack surface. ([Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys))

## Decisions

Chosen: **A — server actions + DB immutable-column trigger** (over B, server-actions-only, which leaves the direct-PostgREST forge hole open).

## Architecture

### Layer 1 — Server actions (app boundary), `src/app/dashboard/order-actions.ts`

Three `"use server"` actions replacing the browser mutations. Each: Zod-validates `orderId` (uuid), gates on `getVendor()` (signed-in; **RLS enforces ownership** — no new auth copy, reuses the D1 gate), re-reads the order server-side (never trusts client state), enforces the **legal transition**, writes via the RLS-scoped server client, `revalidatePath("/dashboard")`, returns `ActionResult`.

- `advanceOrder(orderId)` — reads current `status` + `payment_status`; looks up `ADVANCE[status]`; rejects if no legal next; builds the patch with the existing pure `buildAdvancePatch` (moves `ADVANCE` map from the component into `lib/orders.ts` so both share one source — small dedup).
- `confirmOrderPayment(orderId)` — only from `pending`/`claimed`; idempotent if already `confirmed`; rejects `not_required`. Sets `payment_status='confirmed'`, `paid_at=now`.
- `cancelOrder(orderId)` — rejects if already terminal (`isTerminal`). Sets `status='cancelled'`.

The vendor's server client uses the **authenticated** role (cookie session), **not** service-role — so RLS + WITH CHECK + trigger all still apply. This is deliberately not a `SECURITY DEFINER` RPC: unlike the anon customer path, the vendor is authenticated and RLS already scopes ownership; the actions add validation + a single choke point.

### Layer 2 — DB enforcement, migration `0032_order_integrity.sql`

1. **Add `WITH CHECK`** to `orders_vendor_update` (drop + recreate; pre-launch, clean). Both clauses = `booth_id IN (SELECT id FROM booths WHERE vendor_id = auth.uid())`. Matches the sibling `orders_vendor_select` style (bare `auth.uid()`; the systematic `(select auth.uid())` L8 conversion is its own sweep).
2. **`BEFORE UPDATE` freeze trigger** `orders_freeze_columns` — `RAISE EXCEPTION 'ORDER_IMMUTABLE_COLUMN'` if any of these change (`IS DISTINCT FROM`, null-safe): `booth_id`, `order_number`, `customer_name`, `items`, `total_cents`, `created_at`, `idempotency_key`, `payment_method_kind`. These are set once by `place_order` (INSERT) and must never change. SECURITY INVOKER (reads only NEW/OLD, no table access). Fires on **every** UPDATE incl. service-role — nothing legitimately mutates these, so that's desired.

Mutable (vendor state machine) columns, untouched by the trigger: `status`, `payment_status`, `paid_at`, `ready_at`, `completed_at`, `updated_at`.

**Coexistence:** the existing `orders_updated_at` BEFORE UPDATE (sets `updated_at`, not frozen) and `orders_stock_sync_upd` AFTER UPDATE OF status (cancel only flips `status`, not frozen) are unaffected. `place_order` is INSERT → the UPDATE-only trigger never fires on it.

## Testing

- **Server actions** (`order-actions.test.ts`, node) — mock `createServerClient`+`getVendor`: `advanceOrder` builds the right patch / rejects an un-advanceable status; `confirmOrderPayment` idempotency + `not_required` reject; `cancelOrder` terminal guard.
- **Component** (`order-card.dom.test.tsx`) — remock: assert the button click calls the server action with `order.id` (patch-building assertions move to the server-action test).
- **`lib/orders`** — `ADVANCE` map shape (now exported).
- **pgTAP** (`rls.test.sql`) — vendor UPDATE of `total_cents`/`items`/`booth_id` throws `ORDER_IMMUTABLE_COLUMN`; vendor UPDATE of `status` succeeds; `WITH CHECK` blocks re-pointing `booth_id` to another vendor's booth. Bump `plan(n)`.

## Out of scope (later Phase B/C/D)

S4 trusted-IP rate limit, L8 systematic `(select auth.uid())`, L11 admin bounding, B5 image orphans, P6 a11y/global-error, the D-series dedupe, coverage/CI-e2e.
