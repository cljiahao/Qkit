-- Stock oversell race (T4 + R4). Two gaps:
--   1. place_order read booth_remaining_stock and gated BEFORE acquiring the
--      per-booth order_seq lock; the sold counter is bumped only in the AFTER
--      INSERT trigger. Two concurrent last-unit orders both read remaining=1,
--      both pass the gate, both insert → oversold. Fix: gate AFTER the
--      `UPDATE booths SET order_seq` row-lock, which serializes concurrent
--      orders on the same booth — the second waits for the first to commit,
--      then reads the counter INCLUDING the first's sale. A gate failure
--      RAISEs, rolling back the whole RPC (including the seq bump), so a
--      rejected order still consumes no order number.
--   2. Three sites derived per-item quantities with DIFFERENT clamp rules: the
--      gate clamped per line (GREATEST(qty,0)); apply_order_stock_delta summed
--      unclamped then floored the counter; the backfill summed unclamped. Unify
--      via one order_item_quantities() helper so the gate and the counter can
--      never disagree.

-- ── Single source of truth for per-item order quantities ─────────────────────
-- Pool by menu item, clamp each line to >= 0, drop items that net to 0. Pure
-- (no table access) so it's safe to call from any SECURITY DEFINER context.
CREATE OR REPLACE FUNCTION qkit.order_item_quantities(p_items jsonb)
RETURNS TABLE (menu_item_id text, qty int)
LANGUAGE sql
IMMUTABLE
SET search_path = qkit
AS $$
  SELECT it->>'menuItemId', sum(GREATEST((it->>'quantity')::int, 0))::int
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS it
  GROUP BY it->>'menuItemId'
  HAVING sum(GREATEST((it->>'quantity')::int, 0)) > 0;
$$;

-- Counter maintenance now derives its delta from the shared helper — the exact
-- same quantities the gate checks. (Called on NEW.items, which place_order has
-- already sanitized to positive lines, so the clamp is a no-op here but keeps
-- the rule identical across gate and counter.)
CREATE OR REPLACE FUNCTION qkit.apply_order_stock_delta(
  p_booth_id uuid, p_items jsonb, p_sign int
)
RETURNS void
LANGUAGE sql
SET search_path = qkit
AS $$
  INSERT INTO qkit.booth_item_sold (booth_id, menu_item_id, qty)
  SELECT p_booth_id, q.menu_item_id, p_sign * q.qty
  FROM qkit.order_item_quantities(p_items) AS q
  ON CONFLICT (booth_id, menu_item_id)
  DO UPDATE SET qty = GREATEST(qkit.booth_item_sold.qty + EXCLUDED.qty, 0);
$$;

-- ── place_order: gate stock AFTER the serializing lock, on the priced items ───
-- Same contract + all 0033 hardening; only the stock gate moves. It now runs
-- after `UPDATE booths SET order_seq` (which row-locks the booth) and checks the
-- persisted v_priced quantities via order_item_quantities — the same data the
-- AFTER-INSERT counter bump uses.
CREATE OR REPLACE FUNCTION qkit.place_order(
  p_short_code      text,
  p_customer_name   text,
  p_items           jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_existing text;
  v_seq int;
  v_number text;
  v_total int := 0;
  v_priced jsonb := '[]'::jsonb;
  v_expects_payment boolean;
  v_payment_kind text;
  line jsonb;
  menu_item jsonb;
  opt jsonb;
  v_qty int;
  v_price int;
  v_cost int;
  v_remaining jsonb;
  r record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name required';
  END IF;

  IF length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name too long';
  END IF;

  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_EXPIRED: unknown code';
  END IF;

  -- Idempotent replay: return the prior order if this key already landed. Runs
  -- before the flood guard so a legit client retry never trips the limiter.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number INTO v_existing
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_number', v_existing, 'booth_id', b.id);
    END IF;
  END IF;

  -- Booth-scoped flood guard INSIDE the RPC (the per-IP guard lives in the
  -- server action, which a direct RPC call skips).
  IF NOT qkit.check_rate_limit('order:booth:' || b.id::text, 120, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
  END IF;

  IF NOT qkit.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  -- Cap the distinct line count (the direct-RPC path skips the Zod bound).
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'ORDER_INVALID: too many items';
  END IF;

  -- Re-price every line from the STORED menu (never trust client price/cost),
  -- enforce per-line availability, validate options. Build the persisted items
  -- array with server-authoritative name + price_cents (+ cost_cents only when
  -- set). Stock is NOT gated here — that happens after the lock below.
  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT mi INTO menu_item
    FROM jsonb_array_elements(b.menu_items) AS mi
    WHERE mi->>'id' = line->>'menuItemId';

    IF menu_item IS NULL OR NOT COALESCE((menu_item->>'available')::boolean, true) THEN
      RAISE EXCEPTION 'ORDER_ITEM_UNAVAILABLE: %', line->>'menuItemId';
    END IF;

    v_qty := GREATEST((line->>'quantity')::int, 0);
    IF v_qty = 0 THEN CONTINUE; END IF;

    IF v_qty > 20 THEN
      RAISE EXCEPTION 'ORDER_INVALID: quantity';
    END IF;

    IF line ? 'options' AND jsonb_typeof(line->'options') = 'array' THEN
      IF jsonb_array_length(line->'options') > 20 THEN
        RAISE EXCEPTION 'ORDER_INVALID: too many options';
      END IF;
      FOR opt IN SELECT * FROM jsonb_array_elements(line->'options') LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(menu_item->'option_groups', '[]'::jsonb)) AS g,
               jsonb_array_elements(g->'choices') AS c
          WHERE g->>'label' = opt->>'group'
            AND c->>'label' = opt->>'choice'
        ) THEN
          RAISE EXCEPTION 'ORDER_INVALID: unknown option';
        END IF;
      END LOOP;
    END IF;

    v_price := COALESCE((menu_item->>'price_cents')::int, 0);
    -- NULL when the item carries no cost (absent key) → cost_cents omitted so the
    -- margin stats don't treat a no-cost vendor as 100% margin.
    v_cost  := (menu_item->>'cost_cents')::int;
    v_total := v_total + v_price * v_qty;

    v_priced := v_priced || jsonb_build_array(
      (line - 'price_cents' - 'cost_cents' - 'name')
      || jsonb_build_object('name', menu_item->>'name', 'price_cents', v_price)
      || CASE WHEN v_cost IS NOT NULL
           THEN jsonb_build_object('cost_cents', v_cost)
           ELSE '{}'::jsonb END
    );
  END LOOP;

  -- Every line priced to nothing (all qty 0) → reject before burning a number.
  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  -- Payment snapshot (mirror of the old app logic; 'stripe' is dark → no online pay).
  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';

  -- Acquire the per-booth lock: this row-locks the booth, serializing every
  -- concurrent place_order on it. The stock gate below therefore sees all sales
  -- committed by orders that won the lock ahead of us.
  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, 4, '0');

  -- Stock gate (race-safe: after the lock). Pooled per menu item across lines,
  -- checked against the freshly-read remaining. Gates the SAME quantities the
  -- AFTER-INSERT counter bump will apply (both via order_item_quantities). A
  -- RAISE here rolls back the whole RPC, including the order_seq bump.
  v_remaining := qkit.booth_remaining_stock(b.id);
  FOR r IN SELECT menu_item_id AS id, qty AS want
           FROM qkit.order_item_quantities(v_priced) LOOP
    IF v_remaining ? r.id AND r.want > (v_remaining->>r.id)::int THEN
      RAISE EXCEPTION 'ORDER_SOLD_OUT: %', r.id;
    END IF;
  END LOOP;

  INSERT INTO qkit.orders (
    booth_id, order_number, customer_name, items, total_cents,
    status, payment_status, payment_method_kind, idempotency_key
  ) VALUES (
    b.id, v_number, p_customer_name, v_priced, v_total,
    'preparing',
    CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  -- Lost an idempotency race: return the winner's number (the wasted order_seq is
  -- an acceptable rare gap — matches the project's existing stance on gaps).
  IF NOT FOUND THEN
    SELECT order_number INTO v_number
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('order_number', v_number, 'booth_id', b.id);
END;
$$;
