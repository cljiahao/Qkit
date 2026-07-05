-- Two pre-launch hardening fixes on the customer order path, both landing in
-- place_order (so recreated once here).

-- ── 1. Unguessable per-order token (close the status-page enumeration leak) ──
-- The status page + its polling reads authorized only on {booth_id, 4-digit
-- sequential order_number}. booth_id is not secret (it's in the URL a customer
-- gets after ordering), so anyone who placed one order at a booth could walk
-- 0001..9999 and read every other customer's name, items, and payment status.
-- Add a random token minted per order; the reads must now also match it. NOT
-- NULL DEFAULT backfills any existing row with its own random value.
ALTER TABLE qkit.orders
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

-- ── 2. Server-enforced opening hours ────────────────────────────────────────
-- Hours were enforced only client-side (order-form's `closed` prop). place_order
-- is the ONLY customer write path and never checked them, so a direct RPC call
-- or a stale render could order outside posted hours. booth_open mirrors
-- isBoothOpen (src/lib/hours.ts): SGT wall-clock, daily/weekly windows,
-- overnight-aware; null hours = always open. IMMUTABLE-ish but reads the clock
-- via its arg, so it's STABLE.
CREATE OR REPLACE FUNCTION qkit.booth_open(p_hours jsonb, p_now timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  sgt        timestamp;   -- SGT wall-clock (UTC+8, no DST)
  now_min    int;
  day_key    text;
  win        jsonb;
  o_min      int;
  c_min      int;
BEGIN
  IF p_hours IS NULL OR jsonb_typeof(p_hours) = 'null' THEN
    RETURN true;                       -- no schedule → open whenever active
  END IF;

  sgt := p_now AT TIME ZONE 'Asia/Singapore';
  now_min := extract(hour from sgt)::int * 60 + extract(minute from sgt)::int;

  IF p_hours->>'mode' = 'daily' THEN
    win := p_hours;                    -- carries open/close directly
  ELSIF p_hours->>'mode' = 'weekly' THEN
    -- extract(dow): 0=Sun..6=Sat → key order below is 1-based on dow+1.
    day_key := (array['sun','mon','tue','wed','thu','fri','sat'])[
                 extract(dow from sgt)::int + 1];
    win := p_hours->'days'->day_key;
    IF win IS NULL OR jsonb_typeof(win) = 'null' THEN
      RETURN false;                    -- weekly + no window that day → closed
    END IF;
  ELSE
    RETURN true;                       -- unknown shape → don't block ordering
  END IF;

  o_min := split_part(win->>'open', ':', 1)::int * 60
         + split_part(win->>'open', ':', 2)::int;
  c_min := split_part(win->>'close', ':', 1)::int * 60
         + split_part(win->>'close', ':', 2)::int;

  IF o_min = c_min THEN RETURN true; END IF;              -- degenerate → all day
  IF c_min > o_min THEN RETURN now_min >= o_min AND now_min < c_min; END IF;
  RETURN now_min >= o_min OR now_min < c_min;             -- overnight wrap
END;
$$;

-- Recreate place_order: adds the hours gate (after booth_servable) and returns
-- the new access_token. Everything else reproduced verbatim from 0042.
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
