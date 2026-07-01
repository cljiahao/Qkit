# Customer Order Path v2 — Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all customer-write enforcement into Postgres, keyed on a single rotating 12-char `short_code`; QR becomes `/o/{code}`; `cost_cents`/internal ids and the raw `orders` table are unreachable by the public anon key.

**Architecture:** Two `SECURITY DEFINER` RPCs (`get_booth_for_order` read, `place_order` write) become the only public surface; direct anon `SELECT booths` / `INSERT orders` / `EXECUTE next_order_number` are revoked. Stock moves from a full-history recompute to a trigger-maintained counter. The `access_token`/`?k=` model from the prior session is removed and replaced.

**Tech Stack:** Supabase Postgres (pgcrypto, plpgsql, RLS, PostgREST RPC), Next.js 16 App Router, TypeScript strict, Vitest (node+jsdom), pgTAP (`supabase test db`), Playwright.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Enforcement of the customer write path lives in **Postgres**, not app code. Anon must not be able to `SELECT booths`, `INSERT orders`, or `EXECUTE next_order_number` directly.
- Every `SECURITY DEFINER` function: pin `SET search_path = public`; `GRANT EXECUTE` only to the intended role (`anon` for the two public RPCs; `authenticated` for `regenerate_short_code`). Bundle GRANT/REVOKE in the same migration as the object.
- `get_booth_for_order` must NEVER return `cost_cents`, `short_code`, or any vendor-private field.
- Short code: **12 chars base62** (`0-9a-zA-Z`), from `extensions.gen_random_bytes`. Never `Math.random()`. `booths.short_code` is `NOT NULL UNIQUE`, indexed.
- URL shape: `/o/{code}`. Status page stays `/order/{boothId}/{orderNumber}` (unchanged, service-role read).
- Never trust client item prices — `place_order` computes `cost_cents`/`total_cents` from the stored menu.
- After any schema change, update BOTH `supabase/migrations/` and `src/lib/types.ts`.
- Migrations can't be applied on this Windows machine (Supabase CLI can't spawn) — verify SQL by inspection; runtime apply + pgTAP + e2e run on CI / a Supabase-capable box. tsc + unit/DOM tests are the local gate.
- Next migration number is **0027** (last is `0026_regenerate_booth_token.sql`).
- Hours-open and IP rate-limit remain app-layer (documented residuals; hours is UX-only, rate-limit trusted-IP is Phase B). The RPC enforces the security-critical gates: valid code, servability, stock, server-computed cost, atomic numbering, idempotency.

---

### Task 1: Migration — `short_code` column + generator; drop `access_token`

**Files:**

- Create: `supabase/migrations/0027_booth_short_code.sql`
- Modify: `src/lib/types.ts` (booths Row/Insert/Update: add `short_code`, remove `access_token`; Functions: add `gen_short_code`, remove `gen_booth_token`)

**Interfaces:**

- Produces: `public.gen_short_code() RETURNS text`; column `booths.short_code TEXT NOT NULL UNIQUE`; index `booths_short_code_idx`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_booth_short_code.sql`:

```sql
-- Rotating public short code for a booth's QR. Replaces access_token: it is BOTH
-- the pretty URL id and the unguessable capability. 12 base62 chars ~= 71 bits.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.gen_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT text :=
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; -- 62 chars
  b bytea := extensions.gen_random_bytes(12);
  result text := '';
  i int;
BEGIN
  -- byte % 62 has negligible modulo bias at 71 bits — fine for an unguessable
  -- lookup id (not a cryptographic secret needing perfect uniformity).
  FOR i IN 0..11 LOOP
    result := result || substr(alphabet, (get_byte(b, i) % 62) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Add the column with the generated default (backfills every existing booth with
-- a distinct code — Postgres evaluates a VOLATILE default per row for this DDL).
ALTER TABLE public.booths
  ADD COLUMN short_code TEXT NOT NULL DEFAULT public.gen_short_code();
ALTER TABLE public.booths
  ADD CONSTRAINT booths_short_code_key UNIQUE (short_code);
CREATE INDEX booths_short_code_idx ON public.booths (short_code);

-- Remove the superseded access_token model (regenerate_booth_token is replaced
-- in task 5; drop it here so the column can go).
DROP FUNCTION IF EXISTS public.regenerate_booth_token(uuid);
ALTER TABLE public.booths DROP COLUMN IF EXISTS access_token;
DROP FUNCTION IF EXISTS public.gen_booth_token();
```

- [ ] **Step 2: Apply + verify (CI / Supabase box)**

Run: `/supabase-migrate` (or `supabase db reset`).
Expected: applies clean; `select id, short_code, length(short_code) from booths;` → every row a distinct 12-char code. If local apply is unavailable, sanity-check SQL by eye and note deferral.

- [ ] **Step 3: Update `src/lib/types.ts`**

In `booths` `Row`: replace `access_token: string;` with `short_code: string;`. In `Insert` and `Update`: replace `access_token?: string;` with `short_code?: string;`.
In `Functions`: remove the `regenerate_booth_token` entry (re-added under a new name in Task 5) and add:

```ts
gen_short_code: {
  Args: Record<string, never>;
  Returns: string;
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: fails ONLY in files still referencing `access_token`/`isTokenValid`/`regenerateBoothToken` (fixed in Tasks 5–8). Confirm no OTHER errors. (If executing strictly task-by-task, expect these known dangles until their task lands.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_booth_short_code.sql src/lib/types.ts
git commit -m "feat(order-v2): booth short_code column + generator; drop access_token"
```

---

### Task 2: Migration — trigger-maintained stock counter (fixes L1)

Replaces `booth_remaining_stock`'s full-history recompute with an incremental counter kept by triggers on `orders`. Same function signature/return, so callers are unaffected — just fast.

**Files:**

- Create: `supabase/migrations/0028_stock_counter.sql`
- Modify: `src/lib/types.ts` (add `booth_item_sold` table type)

**Interfaces:**

- Produces: table `public.booth_item_sold(booth_id, menu_item_id, qty)`; triggers on `orders`; rewritten `public.booth_remaining_stock(p_booth_id uuid) RETURNS jsonb` (unchanged signature).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0028_stock_counter.sql`:

```sql
-- Incremental sold-quantity counter per (booth, menu item). Maintained by
-- triggers on orders so booth_remaining_stock no longer scans full order history
-- on every customer page load / order submit.
CREATE TABLE public.booth_item_sold (
  booth_id     UUID NOT NULL REFERENCES public.booths(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (booth_id, menu_item_id)
);
ALTER TABLE public.booth_item_sold ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER functions/triggers touch it; anon/authenticated
-- have no direct access (RLS on + no policy = deny all direct access).

-- Apply a signed delta for every line in an order's items JSON.
CREATE OR REPLACE FUNCTION public.apply_order_stock_delta(
  p_booth_id uuid, p_items jsonb, p_sign int
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.booth_item_sold (booth_id, menu_item_id, qty)
  SELECT p_booth_id,
         it->>'menuItemId',
         p_sign * sum((it->>'quantity')::int)
  FROM jsonb_array_elements(p_items) AS it
  GROUP BY it->>'menuItemId'
  ON CONFLICT (booth_id, menu_item_id)
  DO UPDATE SET qty = GREATEST(public.booth_item_sold.qty + EXCLUDED.qty, 0);
$$;

CREATE OR REPLACE FUNCTION public.orders_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status <> 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, 1);
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only status transitions in/out of 'cancelled' change sold counts.
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, -1);
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, 1);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER orders_stock_sync_ins
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_stock_sync();
CREATE TRIGGER orders_stock_sync_upd
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_stock_sync();

-- Backfill from existing non-cancelled orders.
INSERT INTO public.booth_item_sold (booth_id, menu_item_id, qty)
SELECT o.booth_id, it->>'menuItemId', sum((it->>'quantity')::int)
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items) AS it
WHERE o.status <> 'cancelled'
GROUP BY o.booth_id, it->>'menuItemId'
ON CONFLICT (booth_id, menu_item_id) DO UPDATE SET qty = EXCLUDED.qty;

-- Rewrite remaining-stock to read the counter (same signature + return shape).
CREATE OR REPLACE FUNCTION public.booth_remaining_stock(p_booth_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH caps AS (
    SELECT mi->>'id' AS menu_item_id, (mi->>'stock')::INT AS stock
    FROM public.booths b
    CROSS JOIN LATERAL jsonb_array_elements(b.menu_items) AS mi
    WHERE b.id = p_booth_id
      AND jsonb_typeof(mi->'stock') = 'number'
  )
  SELECT COALESCE(
    jsonb_object_agg(
      caps.menu_item_id,
      GREATEST(caps.stock - COALESCE(s.qty, 0), 0)
    ),
    '{}'::JSONB
  )
  FROM caps
  LEFT JOIN public.booth_item_sold s
    ON s.booth_id = p_booth_id AND s.menu_item_id = caps.menu_item_id;
$$;
```

- [ ] **Step 2: Apply + verify (CI / box)** — reset DB, confirm backfill matches the old recompute for the seeded booth; note deferral if no local Supabase.

- [ ] **Step 3: Update `src/lib/types.ts`** — add to `Tables`:

```ts
booth_item_sold: {
  Row: { booth_id: string; menu_item_id: string; qty: number };
  Insert: { booth_id: string; menu_item_id: string; qty?: number };
  Update: { booth_id?: string; menu_item_id?: string; qty?: number };
  Relationships: [];
};
```

- [ ] **Step 4: Typecheck** — `pnpm exec tsc --noEmit` (same known dangles as Task 1 until later tasks).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_stock_counter.sql src/lib/types.ts
git commit -m "perf(order-v2): trigger-maintained stock counter replaces full recompute"
```

---

### Task 3: Migration — `get_booth_for_order` RPC + revoke anon booth read (fixes S2)

**Files:**

- Create: `supabase/migrations/0029_get_booth_for_order.sql`
- Modify: `src/lib/types.ts` (Functions: add `get_booth_for_order`)

**Interfaces:**

- Produces: `public.get_booth_for_order(p_short_code text) RETURNS jsonb` — returns `null` if unresolved, else `{ booth_id, name, image_url, hours, is_active, servable, menu_items (no cost_cents, available only), remaining }`. `GRANT EXECUTE TO anon, authenticated`. Revokes anon SELECT on `booths`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0029_get_booth_for_order.sql`:

```sql
-- The ONLY public read of a booth. SECURITY DEFINER so it can read booths while
-- anon's direct SELECT is revoked; returns a public-safe projection only (never
-- cost_cents, short_code, vendor_id, order_seq, payment internals).
CREATE OR REPLACE FUNCTION public.get_booth_for_order(p_short_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  b public.booths;
  safe_menu jsonb;
BEGIN
  SELECT * INTO b FROM public.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RETURN NULL;  -- unresolved / rotated-away code
  END IF;

  -- Strip cost_cents from every menu item; keep only available items.
  SELECT COALESCE(jsonb_agg(mi - 'cost_cents'), '[]'::jsonb)
  INTO safe_menu
  FROM jsonb_array_elements(b.menu_items) AS mi
  WHERE COALESCE((mi->>'available')::boolean, true);

  RETURN jsonb_build_object(
    'booth_id',   b.id,
    'name',       b.name,
    'image_url',  b.image_url,
    'hours',      b.hours,
    'is_active',  b.is_active,
    'servable',   public.booth_servable(b.id),
    'menu_items', safe_menu,
    'remaining',  public.booth_remaining_stock(b.id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_booth_for_order(text) TO anon, authenticated;

-- Close the column-leak: anon must not read booths directly anymore (this was how
-- access_token + cost_cents leaked). Vendor/admin reads use authenticated RLS.
REVOKE SELECT ON public.booths FROM anon;
```

Note: `REVOKE SELECT ... FROM anon` removes the table grant; the `booths_public_read` RLS policy becomes moot for anon (no table privilege to evaluate). Leave the policy in place (harmless) or drop it — dropping is cleaner; the plan keeps it to minimize surface change and because authenticated still relies on other policies. Confirm no anon path other than the order page read booths (verified in the spec: landing reads `pricing`; featured-booths is presentational).

- [ ] **Step 2: Apply + verify (CI / box)** — as anon (PostgREST) `select * from booths` → permission denied; `rpc('get_booth_for_order', {p_short_code})` → JSON with no `cost_cents`/`short_code`. Note deferral if no local Supabase.

- [ ] **Step 3: Update `src/lib/types.ts`** — add to `Functions`:

```ts
get_booth_for_order: {
  Args: {
    p_short_code: string;
  }
  Returns: Json;
}
```

- [ ] **Step 4: Typecheck** — `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0029_get_booth_for_order.sql src/lib/types.ts
git commit -m "feat(order-v2): get_booth_for_order RPC; revoke anon booth SELECT"
```

---

### Task 4: Migration — `place_order` RPC + idempotency + revokes (fixes S1/S3/B1)

**Files:**

- Create: `supabase/migrations/0030_place_order.sql`
- Modify: `src/lib/types.ts` (orders Row/Insert/Update: add `idempotency_key`; Functions: add `place_order`)

**Interfaces:**

- Produces: `public.place_order(p_short_code text, p_customer_name text, p_items jsonb, p_idempotency_key uuid) RETURNS jsonb` → `{ order_number, booth_id }` on success; raises with a recognizable message on gate failures. `GRANT EXECUTE TO anon, authenticated`. Column `orders.idempotency_key uuid`; unique `(booth_id, idempotency_key)`. Revokes anon `INSERT orders` + anon `EXECUTE next_order_number`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0030_place_order.sql`:

```sql
-- Idempotency: a client generates one key per cart submit (stable across its one
-- retry), so a committed-but-dropped request can't create a second order.
ALTER TABLE public.orders ADD COLUMN idempotency_key UUID;
CREATE UNIQUE INDEX orders_booth_idem_key
  ON public.orders (booth_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The ONLY customer write path. SECURITY DEFINER; validates + prices + numbers +
-- inserts atomically. Raises a typed error the app maps to a message; the raise
-- text is matched by prefix in the server action.
CREATE OR REPLACE FUNCTION public.place_order(
  p_short_code      text,
  p_customer_name   text,
  p_items           jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.booths;
  v_existing text;
  v_seq int;
  v_number text;
  v_total int := 0;
  v_priced jsonb := '[]'::jsonb;
  v_expects_payment boolean;
  v_payment_kind text;
  line jsonb;
  menu_item jsonb;
  v_qty int;
  v_price int;
  v_cost int;
  v_remaining jsonb;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name required';
  END IF;

  SELECT * INTO b FROM public.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_EXPIRED: unknown code';
  END IF;

  -- Idempotent replay: return the prior order if this key already landed.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number INTO v_existing
    FROM public.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_number', v_existing, 'booth_id', b.id);
    END IF;
  END IF;

  IF NOT public.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  v_remaining := public.booth_remaining_stock(b.id);

  -- Re-price every line from the STORED menu (never trust client price/cost) and
  -- enforce stock. Build the persisted items array with server-authoritative
  -- price_cents + cost_cents.
  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT mi INTO menu_item
    FROM jsonb_array_elements(b.menu_items) AS mi
    WHERE mi->>'id' = line->>'menuItemId';

    IF menu_item IS NULL OR NOT COALESCE((menu_item->>'available')::boolean, true) THEN
      RAISE EXCEPTION 'ORDER_ITEM_UNAVAILABLE: %', line->>'menuItemId';
    END IF;

    v_qty := GREATEST((line->>'quantity')::int, 0);
    IF v_qty = 0 THEN CONTINUE; END IF;

    -- Stock gate (only for capped items present in remaining).
    IF v_remaining ? (line->>'menuItemId') THEN
      IF v_qty > (v_remaining->>(line->>'menuItemId'))::int THEN
        RAISE EXCEPTION 'ORDER_SOLD_OUT: %', line->>'menuItemId';
      END IF;
    END IF;

    v_price := COALESCE((menu_item->>'price_cents')::int, 0);
    v_cost  := COALESCE((menu_item->>'cost_cents')::int, 0);
    v_total := v_total + v_price * v_qty;

    -- Preserve client-chosen options/name but authoritative price/cost.
    v_priced := v_priced || jsonb_build_array(
      (line - 'price_cents' - 'cost_cents')
      || jsonb_build_object('price_cents', v_price, 'cost_cents', v_cost)
    );
  END LOOP;

  -- Payment snapshot (mirror of the old app logic; 'stripe' is dark → no online pay).
  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';

  -- Atomic order number (row-locks the booth counter).
  UPDATE public.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, 4, '0');

  INSERT INTO public.orders (
    booth_id, order_number, customer_name, items, total_cents,
    status, payment_status, payment_method_kind, idempotency_key
  ) VALUES (
    b.id, v_number, p_customer_name, v_priced, v_total,
    'preparing',
    CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) DO NOTHING;

  -- Lost an idempotency race: return the winner's number (the wasted order_seq is
  -- an acceptable rare gap — matches the project's existing stance on gaps).
  IF NOT FOUND THEN
    SELECT order_number INTO v_number
    FROM public.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('order_number', v_number, 'booth_id', b.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb, uuid) TO anon, authenticated;

-- The RPC is now the only write path. Close the direct routes.
REVOKE INSERT ON public.orders FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_order_number(uuid) FROM anon;
```

Note: `orders_public_insert` RLS policy (WITH CHECK true) becomes irrelevant to anon once the table INSERT grant is revoked; leave it (authenticated vendors don't insert orders either, but the grant revoke is the operative control). The pgTAP test in Task 9 asserts anon INSERT is denied.

- [ ] **Step 2: Apply + verify (CI / box)** — as anon: direct `insert into orders` → denied; `rpc('place_order', …)` valid → returns number + row exists; unknown code → ORDER_EXPIRED; same idempotency key twice → one order, same number. Note deferral if no local Supabase.

- [ ] **Step 3: Update `src/lib/types.ts`** — orders `Row`: add `idempotency_key: string | null;`; `Insert`/`Update`: add `idempotency_key?: string | null;`. Functions: add:

```ts
place_order: {
  Args: {
    p_short_code: string;
    p_customer_name: string;
    p_items: Json;
    p_idempotency_key: string;
  }
  Returns: Json;
}
```

- [ ] **Step 4: Typecheck** — `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0030_place_order.sql src/lib/types.ts
git commit -m "feat(order-v2): place_order RPC (atomic, idempotent); revoke anon insert path"
```

---

### Task 5: Migration + action — `regenerate_short_code` (rename from token)

**Files:**

- Create: `supabase/migrations/0031_regenerate_short_code.sql`
- Modify: `src/lib/types.ts` (Functions: add `regenerate_short_code`), `src/app/dashboard/booths/actions.ts` (rename action)

**Interfaces:**

- Consumes: `gen_short_code` (Task 1).
- Produces: `public.regenerate_short_code(p_booth_id uuid) RETURNS integer` (SECURITY INVOKER; rows touched); TS `regenerateShortCode(boothId: string): Promise<ActionResult>`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_regenerate_short_code.sql`:

```sql
-- Rotate a booth's short code. SECURITY INVOKER (default) so the caller's RLS
-- (booths_vendor_update) applies — a vendor rotates only their own booth.
CREATE OR REPLACE FUNCTION public.regenerate_short_code(p_booth_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.booths SET short_code = public.gen_short_code()
  WHERE id = p_booth_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_short_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_short_code(uuid) TO authenticated;
```

- [ ] **Step 2: Update `src/lib/types.ts`** — Functions: add

```ts
regenerate_short_code: {
  Args: {
    p_booth_id: string;
  }
  Returns: number;
}
```

- [ ] **Step 3: Rename the server action**

In `src/app/dashboard/booths/actions.ts`, rename `regenerateBoothToken` → `regenerateShortCode` and change the RPC name:

```ts
export async function regenerateShortCode(
  boothId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(boothId).success)
    return { success: false, error: "Invalid booth" };
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const { data: rows, error } = await supabase.rpc("regenerate_short_code", {
    p_booth_id: boothId,
  });
  if (error) return { success: false, error: "Could not regenerate QR" };
  if (!rows) return { success: false, error: "Booth not found" };
  revalidatePath(`/dashboard/booths/${boothId}/qr`);
  return { success: true };
}
```

- [ ] **Step 4: Typecheck** — `pnpm exec tsc --noEmit` (the regenerate-button import updates in Task 8; expect that one dangle).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0031_regenerate_short_code.sql src/lib/types.ts src/app/dashboard/booths/actions.ts
git commit -m "feat(order-v2): regenerate_short_code replaces regenerate_booth_token"
```

---

### Task 6: `booth-token.ts` → `booth-code.ts`; new `/o/[code]` route; remove old entry route

**Files:**

- Rename/replace: `src/lib/booth-token.ts` → `src/lib/booth-code.ts` (drop `isTokenValid`; `orderPath` builds `/o/{code}`)
- Update: `src/lib/booth-token.test.ts` → `src/lib/booth-code.test.ts`
- Create: `src/app/o/[code]/page.tsx`, and move `expired-code.tsx` + `order-form.tsx` + `recent-orders.tsx` into the new route or import from a shared location (see below)
- Delete: `src/app/order/[boothId]/page.tsx`, `src/app/order/[boothId]/actions.ts` (replaced in Task 7), `src/app/order/[boothId]/expired-code*.tsx`, and the token-specific tests
- Keep: `src/app/order/[boothId]/[orderNumber]/**` (status page — untouched)

**Interfaces:**

- Consumes: `get_booth_for_order` (Task 3).
- Produces: `orderPath(code: string): string` → `/o/{code}`; page at `/o/[code]`.

Note on layout: the customer entry components currently live under `src/app/order/[boothId]/`. To avoid a churny cross-move, keep `order-form.tsx`, `recent-orders.tsx`, `expired-code.tsx` where they are and import them from the new route via relative path `../../order/[boothId]/...`? That's ugly. Cleaner: move the shared customer-order components to `src/components/order/` and import from both. This task moves `order-form.tsx`, `expired-code.tsx`, `recent-orders.tsx` to `src/components/order/` and updates imports.

- [ ] **Step 1: Write the failing test for the new helper**

Create `src/lib/booth-code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderPath } from "./booth-code";

describe("orderPath", () => {
  it("builds the short /o/ entry URL", () => {
    expect(orderPath("Ab3xZ9qK2mNp")).toBe("/o/Ab3xZ9qK2mNp");
  });
  it("url-encodes the code defensively", () => {
    expect(orderPath("a b")).toBe("/o/a%20b");
  });
});
```

Run: `pnpm test -- src/lib/booth-code.test.ts` → FAIL (module missing).

- [ ] **Step 2: Create `src/lib/booth-code.ts`**

```ts
/**
 * Booth short-code helpers. The short code is the sole public capability in the
 * customer order URL; rotating it (regenerate) invalidates every printed QR.
 */
/** The customer order entry URL: `/o/{code}`. */
export function orderPath(code: string): string {
  return `/o/${encodeURIComponent(code)}`;
}
```

Delete `src/lib/booth-token.ts` and `src/lib/booth-token.test.ts`.
Run: `pnpm test -- src/lib/booth-code.test.ts` → PASS.

- [ ] **Step 3: Move shared components** — move `expired-code.tsx`, `order-form.tsx`, `recent-orders.tsx` from `src/app/order/[boothId]/` to `src/components/order/`. Move their `*.dom.test.tsx` alongside. Update all imports (they reference `@/lib/...` mostly; fix the relative `./actions` import in `order-form.tsx` — the action moves in Task 7 to `src/app/o/[code]/actions.ts`, imported as `@/app/o/[code]/actions` or passed as a prop; see Task 7).

- [ ] **Step 4: Create the new route** `src/app/o/[code]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems, parseBoothHours } from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { OrderForm } from "@/components/order/order-form";
import { RecentOrders } from "@/components/order/recent-orders";
import { ExpiredCode } from "@/components/order/expired-code";
import { MediaImage } from "@/components/media-image";

export const revalidate = 0;

interface Props {
  params: Promise<{ code: string }>;
}

// Shape returned by get_booth_for_order (public-safe; no cost_cents/short_code).
const boothForOrder = z.object({
  booth_id: z.string(),
  name: z.string(),
  image_url: z.string().nullable(),
  hours: z.unknown().nullable(),
  is_active: z.boolean(),
  servable: z.boolean(),
  menu_items: z.unknown(),
  remaining: z.unknown(),
});

export default async function OrderEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("get_booth_for_order", {
    p_short_code: code,
  });
  const parsed = boothForOrder.safeParse(data);
  if (!parsed.success) return <ExpiredCode />; // null/unresolved code → hard block
  const booth = parsed.data;

  const available = parseMenuItems(booth.menu_items).filter((m) => m.available);
  const nowIso = new Date().toISOString();
  const hours = parseBoothHours(booth.hours);
  const open = isBoothOpen({ is_active: booth.is_active, hours }, nowIso);
  const reopen = open
    ? null
    : nextOpenLabel({ is_active: booth.is_active, hours }, nowIso);
  const closed = !open || !booth.servable;
  const remaining = parseRemaining(booth.remaining);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-28 pt-8">
      {booth.image_url && (
        <div className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-border">
          <MediaImage
            src={booth.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-cover"
          />
        </div>
      )}
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Order from
        </p>
        <h1 className="font-display mt-1 text-4xl font-semibold leading-[1.05]">
          {booth.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order right here — no app, no account. Just add your name.
        </p>
      </header>
      <RecentOrders boothId={booth.booth_id} />
      {closed && (
        <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
          <p className="font-display text-lg font-semibold text-status-cancelled">
            {!booth.servable ? "Not taking orders" : "Closed right now"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {!booth.servable
              ? "This booth isn't accepting orders right now."
              : `${reopen ?? "Not taking orders at the moment."} You can browse the menu below.`}
          </p>
        </div>
      )}
      <OrderForm
        code={code}
        boothId={booth.booth_id}
        menuItems={available}
        closed={closed}
        remaining={remaining}
      />
    </div>
  );
}
```

Delete `src/app/order/[boothId]/page.tsx` and `src/app/order/[boothId]/actions.ts` (actions replaced in Task 7) and the old `expired-code*.tsx`/`actions.token*.test.ts` under that path.

- [ ] **Step 5: Typecheck + tests** — `pnpm exec tsc --noEmit` (dangles: `OrderForm` `code` prop + moved action, resolved in Task 7). Run `pnpm test -- src/components/order` for the moved DOM tests (update render props: `<OrderForm code="test" boothId="b1" .../>`).

- [ ] **Step 6: Commit (with Task 7)** — commit together with Task 7 so the action/prop resolve.

---

### Task 7: `place_order` server action + order-form idempotency wiring

**Files:**

- Create: `src/app/o/[code]/actions.ts`
- Modify: `src/components/order/order-form.tsx`
- Test: `src/app/o/[code]/actions.dom.test.ts` (or node test)

**Interfaces:**

- Consumes: `place_order` RPC (Task 4).
- Produces: `placeOrder(code: string, input: PlaceOrderInput, idempotencyKey: string): Promise<ActionResult<{ orderNumber: string; boothId: string }>>`. `OrderForm` prop `code: string`.

- [ ] **Step 1: Write the failing test**

Create `src/app/o/[code]/actions.token-reject.test.ts` (node): mock `createServerClient` so `.rpc("place_order", …)` resolves `{ data: null, error: { message: "ORDER_EXPIRED: unknown code" } }`; assert `placeOrder("gone", validInput, "idem")` → `{ success: false, error: "This code expired — please rescan." }`. Also a success case: rpc resolves `{ data: { order_number: "0007", booth_id: "b1" }, error: null }` → `{ success: true, orderNumber: "0007", boothId: "b1" }`. Run → FAIL (module missing).

- [ ] **Step 2: Implement `src/app/o/[code]/actions.ts`**

```ts
"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

type Result = ActionResult<{ orderNumber: string; boothId: string }>;

const codeSchema = z.string().min(1).max(64);
const idemSchema = z.string().uuid();

// Map a place_order RAISE prefix to a customer-facing message.
function messageFor(raw: string): string {
  if (raw.includes("ORDER_EXPIRED"))
    return "This code expired — please rescan.";
  if (raw.includes("ORDER_UNSERVABLE"))
    return "This booth isn't taking orders right now";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "Sorry — an item just sold out. Please adjust your order.";
  return "Could not place order. Please try again.";
}

export async function placeOrder(
  code: string,
  input: PlaceOrderInput,
  idempotencyKey: string,
): Promise<Result> {
  if (!codeSchema.safeParse(code).success)
    return { success: false, error: "This code expired — please rescan." };
  if (!idemSchema.safeParse(idempotencyKey).success)
    return { success: false, error: "Invalid request" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  // Anti-flood (best-effort; trusted-IP hardening is Phase B). Fails open.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `order:${code}:${ip}`,
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (allowed === false)
    return {
      success: false,
      error: "Too many orders too fast — wait a moment and try again.",
    };

  const { data, error } = await supabase.rpc("place_order", {
    p_short_code: code,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { success: false, error: messageFor(error.message) };
  const out = z
    .object({ order_number: z.string(), booth_id: z.string() })
    .safeParse(data);
  if (!out.success)
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  return {
    success: true,
    orderNumber: out.data.order_number,
    boothId: out.data.booth_id,
  };
}
```

- [ ] **Step 3: Wire `order-form.tsx`** — change `Props` to `{ code: string; boothId: string; menuItems; closed?; remaining? }` (drop `token`). Import the new action `import { placeOrder } from "@/app/o/[code]/actions";`. In `onSubmit`, generate one key: `const idem = crypto.randomUUID();` BEFORE the try (stable across the retry). Replace both calls with `placeOrder(code, input, idem)`. On success use `result.boothId` for the redirect: `router.push(\`/order/${result.boothId}/${result.orderNumber}\`)`. Keep the existing `addRecentOrder`(uses`boothId` prop).

- [ ] **Step 4: Tests + typecheck** — `pnpm exec tsc --noEmit` clean now (Task 6 dangles resolved). Run `pnpm test -- src/app/o src/components/order`.

- [ ] **Step 5: Commit (Tasks 6 + 7)**

```bash
git add src/lib/booth-code.ts src/lib/booth-code.test.ts src/components/order src/app/o "src/app/order/[boothId]"
git commit -m "feat(order-v2): /o/[code] route + place_order action + idempotency; remove token path"
```

---

### Task 8: QR poster + regenerate button → short code

**Files:**

- Modify: `src/app/dashboard/booths/[boothId]/qr/page.tsx`, `booth-qr-poster.tsx`, `regenerate-button.tsx`, `regenerate-button.dom.test.tsx`

**Interfaces:**

- Consumes: `orderPath(code)` (Task 6), `regenerateShortCode` (Task 5).

- [ ] **Step 1: QR page fetch** — in `qr/page.tsx`, change the select from `access_token` to `short_code`; pass `code={booth.short_code}` to `<BoothQrPoster>`.

- [ ] **Step 2: Poster** — in `booth-qr-poster.tsx`, replace `import { orderPath } from "@/lib/booth-token"` → `@/lib/booth-code`; change the prop `token: string` → `code: string`; `const url = origin ? \`${origin}${orderPath(code)}\` : null;`.

- [ ] **Step 3: Regenerate button** — in `regenerate-button.tsx`, change the import `regenerateBoothToken` → `regenerateShortCode` (from `../../actions`) and the call site. Update `regenerate-button.dom.test.tsx`'s mock (`regenerateShortCode`) and assertion.

- [ ] **Step 4: `pnpm check`** — `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec prettier --check .`; run `pnpm test -- src/app/dashboard/booths/[boothId]/qr`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/booths/[boothId]/qr"
git commit -m "feat(order-v2): QR poster + regenerate wired to short_code"
```

---

### Task 9: pgTAP RLS/security tests

**Files:**

- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**

- Consumes: all migrations 0027–0031.

- [ ] **Step 1: Add assertions** (as the `anon` role) to `supabase/tests/rls.test.sql`:
  - `SELECT` on `public.booths` as anon → throws / denied (grant revoked).
  - `INSERT` into `public.orders` as anon → denied.
  - `EXECUTE next_order_number` as anon → denied.
  - `get_booth_for_order(<seed code>)` → JSON where `->'menu_items'->0 ? 'cost_cents'` is false and the result has no `short_code` key.
  - `place_order(<seed code>, 'Ada', <valid items>, gen_random_uuid())` → returns an order_number and inserts one row; calling again with the SAME idempotency key → still one row, same number.
  - `place_order(<bogus code>, …)` → raises `ORDER_EXPIRED`.
  - `place_order` for an over-cap quantity → raises `ORDER_SOLD_OUT`.
    (Use the pgTAP patterns already in the file — `throws_ok`, `results_eq`, `lives_ok`. Seed a booth with a known `short_code` and a stock-capped item in the test setup.)

- [ ] **Step 2: Run (CI / box)** — `supabase test db`. Note deferral if no local Supabase; the assertions are the security contract for CI.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls.test.sql
git commit -m "test(order-v2): pgTAP — anon can't read booths/insert orders; place_order gates"
```

---

### Task 10: Seed + E2E + full verify + quality gate

**Files:**

- Modify: `supabase/seed/coffee-cart.sql`, `e2e/qr-token.spec.ts` → `e2e/order-code.spec.ts`, `e2e/customer-order.spec.ts`

- [ ] **Step 1: Seed a fixed short code** — in `coffee-cart.sql`, set `short_code = 'e2eKopitiam01'` (12 chars) on the Kopitiam booth insert + the `on conflict` update (replace the old `access_token` line).

- [ ] **Step 2: Update e2e** — rename `qr-token.spec.ts` → `order-code.spec.ts`: hard-block case `GET /o/bogusCodeXXX` → ExpiredCode text; happy case `GET /o/e2eKopitiam01` → menu renders. In `customer-order.spec.ts`, change navigation from `/order/{BOOTH}?k=…` to `/o/e2eKopitiam01`; keep the status-page assertion (`/order/{BOOTH}/\d+`) unchanged. Use a shared `CODE` const.

- [ ] **Step 3: Full verify** — `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec prettier --check . && pnpm test`. Expected: green (unit/DOM). Run `pnpm test:mutation` and review `src/lib/booth-code.ts` survivors.

- [ ] **Step 4: Quality gate (required)** — `/simplify` (or `/code-review`) over the branch diff: confirm token/`?k=` machinery fully removed (no dangling `access_token`/`isTokenValid`/`regenerateBoothToken` references), no duplicated URL/code logic, and the new RPCs have no dead branches. Address findings.

- [ ] **Step 5: Security scan** — `/security-scan` (audit clean; no secret; short code is not a secret literal beyond the test fixture). gitleaks runs in CI.

- [ ] **Step 6: Commit + finish** — commit; then use superpowers:finishing-a-development-branch.

```bash
git add supabase/seed/coffee-cart.sql e2e/
git commit -m "test(order-v2): seed short_code + e2e for /o/[code]; final verify"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:** short_code + generator (T1); public read RPC hiding cost/token + revoke anon SELECT (T3=S2); place_order atomic RPC + revoke anon insert/next_order_number (T4=S1/S3); idempotency (T4=B1); stock counter (T2=L1); `/o/{code}` route + removal of token model (T6); action + form wiring (T7); QR/regenerate (T5/T8); status page untouched (unmodified); pgTAP security contract (T9); seed+e2e+gates (T10). Rate-limit/hours residuals documented in Global Constraints. ✅

**Placeholder scan:** all SQL/TS shown in full; no TBD. The stock-counter mechanism the spec deferred "to the plan" is fully specified in T2. ✅

**Type consistency:** `orderPath(code)` single-arg used in T6/T8; `placeOrder(code, input, idempotencyKey)` consistent T7 (def) + order-form (call); RPC arg names (`p_short_code`, `p_customer_name`, `p_items`, `p_idempotency_key`) identical across T4 SQL + T7 call + types.ts. `regenerate_short_code`/`regenerateShortCode` consistent T5/T8. `booth_id`/`order_number` return keys consistent T4↔T7. ✅

**Note on task ordering:** T1–T5 leave intentional tsc dangles (files still referencing the old token API) until T6–T8 land; the plan calls this out per task. A subagent-driven runner should treat T6+T7 as a combined commit and expect red tsc between T1–T5.
