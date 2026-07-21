-- Arrival confirmation ("scan-to-start"): a per-booth toggle for
-- perishable-immediately items (ice cream is the concrete case) — when on,
-- a new QR order is held at 'pending' (the dormant OrderStatus value; every
-- order today skips straight to 'preparing') instead of starting prep right
-- away. The customer's own status page then shows a big "I'm here, start my
-- order" prompt; tapping it (confirmArrival, status-actions.ts) flips the
-- order to 'preparing', the same state every order starts in today. See
-- docs/superpowers/specs/2026-07-21-arrival-confirmation-design.md.
--
-- Walk-up orders (place_walkup_order) are deliberately NOT touched — there's
-- no "customer arrives later" concept for an order the vendor is entering
-- in person at the counter.
ALTER TABLE qkit.booths
  ADD COLUMN requires_arrival_confirm BOOLEAN NOT NULL DEFAULT false;

-- Recreate place_order verbatim from its 0063 body with one change: the
-- INSERT's literal 'preparing' status becomes a CASE on the booth's new flag.
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
  v_existing_number text;
  v_existing_token uuid;
  v_seq int;
  v_number text;
  v_token uuid;
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

  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_EXPIRED: unknown code';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number, access_token INTO v_existing_number, v_existing_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_number', v_existing_number,
        'booth_id', b.id,
        'access_token', v_existing_token);
    END IF;
  END IF;

  IF NOT qkit.check_rate_limit('order:booth:' || b.id::text, 120, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
  END IF;

  IF NOT qkit.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF NOT qkit.booth_open(b.hours, now()) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: outside opening hours';
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
      -- Same "Free" convention as base price: only stamp price_cents when
      -- the item was priced OR a selected choice added a cost — an unpriced
      -- item with no priced choices stays keyless, not price_cents:0.
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

  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

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
    (CASE WHEN b.requires_arrival_confirm THEN 'pending' ELSE 'preparing' END)::qkit.order_status,
    (CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END)::qkit.payment_status,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING access_token INTO v_token;

  IF NOT FOUND THEN
    -- Lost the idempotency race: another request inserted first. Return its row.
    SELECT order_number, access_token INTO v_number, v_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;
