-- Two bugs the pgTAP CI job surfaced on first real execution:

-- ── 1. plan escalation was never actually closed ─────────────────────────────
-- 0035 REVOKEd UPDATE(plan), and 0041 GRANTed table-level UPDATE on vendors then
-- REVOKEd UPDATE(plan) — but Postgres cannot carve a single column out of a
-- TABLE-level UPDATE grant, so the revoke was a no-op and `plan` stayed
-- updatable (a vendor could still self-escalate). The correct restriction is a
-- COLUMN-level grant: give `authenticated` UPDATE on only the columns a vendor
-- actually edits (name, tour_seen_at). `plan` is then never granted → the admin
-- (service role) remains the only writer.
REVOKE UPDATE ON qkit.vendors FROM authenticated;
GRANT UPDATE (name, tour_seen_at) ON qkit.vendors TO authenticated;

-- ── 2. place_order failed on the payment_status INSERT ───────────────────────
-- `CASE WHEN … THEN 'pending' ELSE 'not_required' END` resolves to `text`, and
-- there is no implicit text→enum cast, so the INSERT into the payment_status
-- (enum) column raised 42804. Latent until now — pre-launch, nobody had placed a
-- real order, so the pgTAP run is the first actual execution. Cast the CASE to
-- the enum. (Only change vs 0034; the rest is reproduced verbatim.)
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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number INTO v_existing
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_number', v_existing, 'booth_id', b.id);
    END IF;
  END IF;

  IF NOT qkit.check_rate_limit('order:booth:' || b.id::text, 120, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
  END IF;

  IF NOT qkit.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'ORDER_INVALID: too many items';
  END IF;

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

  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';

  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, 4, '0');

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
    (CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END)::qkit.payment_status,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  IF NOT FOUND THEN
    SELECT order_number INTO v_number
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('order_number', v_number, 'booth_id', b.id);
END;
$$;
