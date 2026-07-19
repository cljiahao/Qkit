-- Lets staff record a walk-up order as already paid (e.g. cash collected at
-- the counter) in the same step as placing it, instead of a separate
-- "Confirm payment" tap on the board right after. Adds a p_paid argument to
-- place_walkup_order (migration 0060); everything else is unchanged.
--
-- A new argument changes the function's signature, so CREATE OR REPLACE
-- alone would leave the old 3-arg version behind as a second, stale
-- overload rather than replacing it — drop it explicitly first.
DROP FUNCTION IF EXISTS qkit.place_walkup_order(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION qkit.place_walkup_order(
  p_booth_id      uuid,
  p_customer_name text,
  p_items         jsonb,
  p_paid          boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_seq int;
  v_number text;
  v_token uuid;
  v_total int := 0;
  v_priced jsonb := '[]'::jsonb;
  v_expects_payment boolean;
  v_payment_kind text;
  v_payment_status qkit.payment_status;
  line jsonb;
  menu_item jsonb;
  opt jsonb;
  v_qty int;
  v_price int;
  v_cost int;
  v_delta_price int;
  v_delta_cost int;
  v_option_price_delta int;
  v_option_cost_delta int;
  v_combined_price int;
  v_combined_cost int;
  v_remaining jsonb;
  r record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name required';
  END IF;

  IF length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name too long';
  END IF;

  SELECT * INTO b FROM qkit.booths
    WHERE id = p_booth_id AND vendor_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_UNAUTHORIZED: not your booth';
  END IF;

  IF NOT qkit.check_rate_limit('walkup:booth:' || b.id::text, 60, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
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

    v_option_price_delta := 0;
    v_option_cost_delta := 0;
    IF line ? 'options' AND jsonb_typeof(line->'options') = 'array' THEN
      IF jsonb_array_length(line->'options') > 20 THEN
        RAISE EXCEPTION 'ORDER_INVALID: too many options';
      END IF;
      FOR opt IN SELECT * FROM jsonb_array_elements(line->'options') LOOP
        SELECT (c->>'price_delta_cents')::int, (c->>'cost_delta_cents')::int
        INTO v_delta_price, v_delta_cost
        FROM jsonb_array_elements(COALESCE(menu_item->'option_groups', '[]'::jsonb)) AS g,
             jsonb_array_elements(g->'choices') AS c
        WHERE g->>'label' = opt->>'group'
          AND c->>'label' = opt->>'choice';

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ORDER_INVALID: unknown option';
        END IF;
        v_option_price_delta := v_option_price_delta + COALESCE(v_delta_price, 0);
        v_option_cost_delta := v_option_cost_delta + COALESCE(v_delta_cost, 0);
      END LOOP;
    END IF;

    v_price := (menu_item->>'price_cents')::int;
    v_cost  := (menu_item->>'cost_cents')::int;
    v_combined_price := COALESCE(v_price, 0) + v_option_price_delta;
    v_combined_cost  := COALESCE(v_cost, 0) + v_option_cost_delta;
    v_total := v_total + v_combined_price * v_qty;

    v_priced := v_priced || jsonb_build_array(
      (line - 'price_cents' - 'cost_cents' - 'name')
      || jsonb_build_object('name', menu_item->>'name')
      || CASE WHEN v_price IS NOT NULL OR v_option_price_delta > 0
           THEN jsonb_build_object('price_cents', v_combined_price)
           ELSE '{}'::jsonb END
      || CASE WHEN v_cost IS NOT NULL OR v_option_cost_delta > 0
           THEN jsonb_build_object('cost_cents', v_combined_cost)
           ELSE '{}'::jsonb END
    );
  END LOOP;

  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';
  -- A staff member who already collected payment at the counter can skip
  -- the separate "Confirm payment" tap on the board — same end state
  -- confirmOrderPayment (src/app/dashboard/order-actions.ts) produces, just
  -- reached in one step instead of two.
  v_payment_status := CASE
    WHEN NOT v_expects_payment THEN 'not_required'
    WHEN p_paid THEN 'confirmed'
    ELSE 'pending'
  END;

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
    status, payment_status, payment_method_kind, paid_at, source
  ) VALUES (
    b.id, v_number, p_customer_name, v_priced, v_total,
    'preparing',
    v_payment_status,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    CASE WHEN v_payment_status = 'confirmed' THEN now() ELSE NULL END,
    'walkup'
  )
  RETURNING access_token INTO v_token;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION qkit.place_walkup_order(uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.place_walkup_order(uuid, text, jsonb, boolean) TO authenticated;
