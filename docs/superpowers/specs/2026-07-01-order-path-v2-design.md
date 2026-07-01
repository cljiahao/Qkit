# Customer Order Path v2 — Design (Phase A)

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Depends on:** audit findings `docs/superpowers/specs/2026-07-01-project-audit-findings.md`
**Supersedes:** the `access_token` / `?k=` QR-token design (`2026-07-01-booth-qr-token-design.md`) — that model is replaced, not extended.

## Problem

Two confirmed problems in the same code path:

1. **Security — the DB trusts the public anon key.** The anon/publishable key is inlined into every browser bundle; PostgREST exposes tables per RLS. Every customer-write protection (rate limit, QR token, servability, hours, stock, cost snapshot) lives only in the Next.js Server Action. A direct PostgREST call bypasses all of it:
   - `orders_public_insert WITH CHECK (true)` → anyone inserts arbitrary orders (any `booth_id`, forged `status`/`total_cents`/`items`/`cost_cents`), on paused/inactive booths, with no rate limit or valid token. (S1)
   - `booths_public_read` is row-level; anon can `select=access_token,menu_items` and read the current QR token (defeating rotation) and vendor `cost_cents`. (S2)
   - `next_order_number` is granted to anon and unguarded — direct calls burn a booth's order sequence. (S3)
2. **QR URL is long** (~95 chars): permanent booth UUID + `?k=` token. Community best practice for scannable QR is a short (~20–30 char) URL; long codes force denser QR / larger prints and eat error-correction budget.

Because both problems live in the customer order path, they are fixed together.

## Goal

Rebuild the customer order path so **all enforcement lives in Postgres**, keyed on a **single rotating short code** that is the sole public capability. The QR shrinks to ~34 chars; `cost_cents`, internal ids, and the raw `orders` table never leave the server. The vendor rotates the code on demand (unchanged UX from the shipped Regenerate button).

## Decisions (locked in brainstorming)

1. **Short code replaces the token.** `booths.short_code` is a **12-char base62** (~71-bit) value: unguessable at event scale, URL ~34 chars. The just-shipped `access_token` and its `isTokenValid`/`?k=` machinery are **removed**, not layered.
2. **URL:** `https://<host>/o/{code}` (short `/o/` path).
3. **Regenerate** mints a new `short_code`; the old code no longer resolves → the reused `ExpiredCode` screen. Confirmation modal (naming the booth) is kept.
4. **Status page unchanged:** `/order/{boothId}/{orderNumber}` stays keyed on the stable `boothId` (read via the service-role client, server-only) so an in-progress customer is unaffected by rotation.
5. **Two SECURITY DEFINER RPCs** carry the public surface; direct anon `SELECT` on `booths` and direct anon `INSERT` on `orders` are revoked.

## Architecture

Best-practice grounding (Supabase): a `SECURITY DEFINER` function with a pinned `search_path`, `EXECUTE` granted only to `anon`, is the sanctioned way to let an anonymous caller write/read with server-side validation; column hiding is done by returning only safe columns from such a function (native column-level security doesn't exist; `security_barrier` views are slower).

### Component 1 — `short_code` column + generator

```sql
-- 12-char base62 (~71 bits). Unique + indexed (it's the sole public lookup key).
ALTER TABLE public.booths
  ADD COLUMN short_code TEXT NOT NULL DEFAULT public.gen_short_code() UNIQUE;
CREATE INDEX booths_short_code_idx ON public.booths (short_code);
```

- `gen_short_code()` — generates 12 base62 chars from `gen_random_bytes` (rejection-sample or map bytes → base62), VOLATILE. On the astronomically unlikely unique-collision, the caller retries (regenerate) / the insert default retries.
- Migration backfills existing booths; drops `access_token` and `gen_booth_token()`.

### Component 2 — `get_booth_for_order(p_short_code text)` (public read, fixes S2)

- `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO anon` (public schema, so PostgREST exposes it — intended). Returns a single JSON/row with **only**: `booth_id`, `name`, `image_url`, `hours`, `is_active`, `servable` (computed), and `menu_items` **with `cost_cents` stripped and unavailable items removed**, plus live `remaining` stock per capped item. Returns nothing when the code doesn't resolve.
- **`REVOKE SELECT ON public.booths FROM anon`** — the order page no longer reads `booths` directly; this closes the token/cost leak at the DB. (Vendor dashboard reads use the authenticated owner RLS — unaffected. Landing page reads `pricing`, not `booths` — unaffected.)

### Component 3 — `place_order(...)` RPC (atomic, fixes S1/S3/B1/L1)

```
place_order(p_short_code text, p_customer_name text, p_items jsonb, p_idempotency_key uuid)
  RETURNS TABLE(order_number text, booth_id uuid)   -- booth_id for the status redirect
```

- `SECURITY DEFINER`, pinned `search_path`, `GRANT EXECUTE TO anon`. Atomically, in one DB round trip:
  1. Resolve `short_code` → booth; if absent → raise/return a typed "expired" error.
  2. Gate: `booth_servable` + open-hours + per-item **stock** (reusing the existing serveability logic).
  3. Validate `p_items` server-side against the booth's real menu; **compute `cost_cents` and `total_cents` from the stored menu** (never trust client) → fixes the forged-cost hole.
  4. **Idempotency:** unique index `orders(booth_id, idempotency_key)`; `INSERT ... ON CONFLICT (booth_id, idempotency_key) DO NOTHING`; if no row inserted, return the existing order's number → fixes B1 double-order.
  5. Allocate the order number inline (fold in `next_order_number`'s row-locked increment).
- **`REVOKE INSERT ON public.orders FROM anon`** (fixes S1) and **`REVOKE EXECUTE ON next_order_number FROM anon`** (fixes S3). The RPC is the only write path; a direct PostgREST call still hits every gate.
- **Stock (L1):** maintain an incremental sold-counter (the RPC is now the sole order writer) instead of `booth_remaining_stock`'s full-history recompute. Exact mechanism (a `booth_item_sold` counter table updated in the RPC, decremented on cancel) detailed in the plan.

### Component 4 — Rate limiting

- Stays in the thin Server Action wrapper around `place_order` (trusted-IP fix is Phase B / S4). The RPC enforces all **business** gates, so bypassing the action cannot bypass servability/stock/validity — only the anti-flood counter, which is defense-in-depth. Documented as an accepted residual until Phase B.

### Component 5 — App wiring

- **New route `src/app/o/[code]/page.tsx`** → calls `get_booth_for_order`; unresolved → render `ExpiredCode`. Renders the existing order UI. (The old `src/app/order/[boothId]/page.tsx` entry route is removed; `/order/[boothId]/[orderNumber]` status route stays.)
- **`order-form.tsx`** generates a `crypto.randomUUID()` idempotency key per cart submit (stable across the one retry), calls the `place_order` server action, redirects to `/order/{booth_id}/{order_number}` on success.
- **QR poster** encodes `${origin}/o/${short_code}`; regenerate action rotates `short_code` (rename `regenerateBoothToken` → `regenerateShortCode`, RPC `regenerate_short_code`, still SECURITY INVOKER + `authenticated`-only + booth-naming confirm modal).
- **Remove** `src/lib/booth-token.ts`'s `isTokenValid`, the `?k=` handling, and `access_token` from `types.ts`; keep/rename `orderPath` to build `/o/{code}`.

## Data flow

- **Scan → render:** `GET /o/{code}` → `get_booth_for_order(code)` (1 round trip, safe columns only) → render menu or `ExpiredCode`.
- **Place order:** form → server action (rate-limit by trusted IP) → `place_order(code, name, items, idemKey)` (1 atomic round trip) → redirect to status page.
- **Rotate:** vendor confirm → `regenerate_short_code(boothId)` (owner RLS) → new code → old QR resolves to nothing.

## Error handling

- Unresolved code (never existed or rotated away): read returns empty → `ExpiredCode` screen (HTTP 200). `place_order` raises a typed error the action maps to `{ success:false, error: "This code expired — please rescan." }`.
- Sold out / closed / not servable: `place_order` returns the existing specific messages.
- Idempotent replay: returns the original order number, `success:true` (no duplicate).

## Testing

- **Unit (`src/lib`, mutation-tested):** short-code generation shape/charset/length; `orderPath` → `/o/{code}`; any pure validation extracted from the RPC path.
- **DOM:** `/o/[code]` renders menu on resolve, `ExpiredCode` on miss; order-form sends an idempotency key.
- **pgTAP RLS (`supabase/tests/rls.test.sql`)** — the critical additions:
  - anon **cannot** `SELECT` `booths` directly (revoked); `get_booth_for_order` returns **no** `cost_cents`/`short_code`/`access_token`.
  - anon **cannot** `INSERT` into `orders` directly; can only via `place_order`.
  - `place_order` rejects: unresolved code, unservable/closed booth, oversold item; and is idempotent on a repeated key.
  - anon **cannot** `EXECUTE next_order_number`.
- **E2E:** scan `/o/{code}` → order → status; rotate → old code shows expired, new code orders. Extends the coffee-cart seed (seed a fixed `short_code`).

## Migration / rollout

- Pre-launch, no vendors → clean cutover. Single migration adds `short_code` + RPCs + grants/revokes, drops `access_token`/`gen_booth_token`/`regenerate_booth_token`. Update `src/lib/types.ts` (Row/Insert/Update + Functions: `get_booth_for_order`, `place_order`, `regenerate_short_code`; drop the removed ones). Seed sets a fixed `short_code` for the Kopitiam booth.
- Migration apply + e2e run on CI / a Supabase-capable machine (local Windows CLI can't spawn — carried over).

## Out of scope (later phases)

- Trusted-IP rate limiting / `TRUST_PROXY` (S4), vendor-side `order-card` server action + `WITH CHECK` (B2), RLS `(select auth.uid())` (L8), the dedupe pass (P2), coverage/CI-e2e (P4). Tracked in the audit roadmap.
- Status-page poll merge (L6) and dashboard auth memoization (L9) — Phase B/C.
