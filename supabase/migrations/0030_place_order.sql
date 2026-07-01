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

  IF length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name too long';
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

  -- Stock is pooled per menu item across lines (option variants share a cap).
  -- Gated once, aggregated, before pricing — a per-line check would let two
  -- lines of the same capped item each pass individually while their sum
  -- oversells the cap.
  DECLARE
    r record;
  BEGIN
    FOR r IN
      SELECT it->>'menuItemId' AS id, sum((it->>'quantity')::int) AS want
      FROM jsonb_array_elements(p_items) AS it
      GROUP BY it->>'menuItemId'
    LOOP
      IF v_remaining ? r.id AND r.want > (v_remaining->>r.id)::int THEN
        RAISE EXCEPTION 'ORDER_SOLD_OUT: %', r.id;
      END IF;
    END LOOP;
  END;

  -- Re-price every line from the STORED menu (never trust client price/cost) and
  -- enforce per-line availability. Build the persisted items array with
  -- server-authoritative price_cents + cost_cents.
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
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

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
