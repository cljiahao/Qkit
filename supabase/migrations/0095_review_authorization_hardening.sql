-- October review: preserve application contracts while closing direct Data API
-- bypasses. No data is rewritten; existing rows and service-role writes remain.
-- Rollback: restore prior function bodies from 0070/0087 and prior column grants.
-- Do not restore PUBLIC EXECUTE or plan/printer INSERT access as a routine rollback.

REVOKE EXECUTE ON FUNCTION qkit.assign_order_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.assign_order_number(uuid) TO service_role;

-- A public generic limiter lets callers poison arbitrary other users' buckets.
-- Application callers use a service client; definer RPCs keep owner execution.
REVOKE EXECUTE ON FUNCTION qkit.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.check_rate_limit(text, int, int) TO service_role;

-- Preserve anonymous analytics through logEvent, but require its validated
-- server path instead of exposing unrestricted event rows to the Data API.
REVOKE INSERT ON qkit.events FROM anon, authenticated;
DROP POLICY IF EXISTS events_public_insert ON qkit.events;
GRANT INSERT ON qkit.events TO service_role;

-- UPDATE-only restrictions do not constrain INSERT. Preserve onboarding's id-only
-- insert and explicitly allow the existing vendor-editable fields.
REVOKE INSERT ON qkit.vendors FROM authenticated;
GRANT INSERT (id, created_at, tours_seen, board_settings) ON qkit.vendors TO authenticated;

REVOKE INSERT ON qkit.booths FROM authenticated;
GRANT INSERT (
  id, vendor_id, name, menu_items, is_active, created_at, image_url, hours,
  order_seq, payment, short_code, social_links, requires_arrival_confirm,
  menu_categories, walkup_default, print_enabled, paykit_booking_id, daily_cup_cap
) ON qkit.booths TO authenticated;

-- 0094 postdates the column grant in 0091; newly-added columns do not inherit it.
GRANT UPDATE (daily_cup_cap) ON qkit.booths TO authenticated;

-- 0058 postdates the blanket service-role grant in 0041. RLS bypass does not
-- bypass SQL privileges, so the admin's service client still needs these rights.
GRANT SELECT, INSERT, UPDATE ON qkit.platform_settings TO service_role;

-- Remove both base and nested option costs from the public RPC response.
CREATE OR REPLACE FUNCTION qkit.get_booth_for_order(p_short_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_social jsonb;
  safe_menu jsonb;
BEGIN
  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RETURN NULL;  -- unresolved / rotated-away code
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'merqo' AND table_name = 'vendor_profile'
  ) THEN
    SELECT social_links INTO v_social FROM merqo.vendor_profile WHERE vendor_id = b.vendor_id;
  END IF;

  -- Strip cost_cents from every menu item; keep only available items.
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(mi->'option_groups') = 'array' THEN
      jsonb_set(mi - 'cost_cents', '{option_groups}', (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN jsonb_typeof(g->'choices') = 'array' THEN
            jsonb_set(g, '{choices}', (
              SELECT COALESCE(jsonb_agg(c - 'cost_delta_cents'), '[]'::jsonb)
              FROM jsonb_array_elements(g->'choices') AS c
            ))
          ELSE g END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(mi->'option_groups') AS g
      ))
    ELSE mi - 'cost_cents' END
  ), '[]'::jsonb)
  INTO safe_menu
  FROM jsonb_array_elements(b.menu_items) AS mi
  WHERE COALESCE((mi->>'available')::boolean, true);

  RETURN jsonb_build_object(
    'booth_id',        b.id,
    'name',            b.name,
    'image_url',       b.image_url,
    'hours',           b.hours,
    'is_active',       b.is_active,
    'servable',        qkit.booth_servable(b.id),
    'menu_items',      safe_menu,
    'menu_categories', b.menu_categories,
    'remaining',       qkit.booth_remaining_stock(b.id),
    'social_links',    COALESCE(b.social_links, v_social, '{}'::jsonb)
  );
END;
$$;


-- Private, shared validation for both order entry points. The public Zod
-- contract permits omitted options; retain that compatibility while rejecting
-- malformed arrays and impossible repeated selections before persisting JSON.
CREATE OR REPLACE FUNCTION qkit.validate_order_options(p_menu_item jsonb, p_options jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = qkit
AS $$
DECLARE
  opt jsonb;
BEGIN
  IF p_options IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_options) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ORDER_INVALID: options must be an array';
  END IF;
  IF jsonb_array_length(p_options) > 20 THEN
    RAISE EXCEPTION 'ORDER_INVALID: too many options';
  END IF;
  FOR opt IN SELECT * FROM jsonb_array_elements(p_options) LOOP
    IF jsonb_typeof(opt) IS DISTINCT FROM 'object'
      OR jsonb_typeof(opt->'group') IS DISTINCT FROM 'string'
      OR jsonb_typeof(opt->'choice') IS DISTINCT FROM 'string'
      OR length(opt->>'group') NOT BETWEEN 1 AND 100
      OR length(opt->>'choice') NOT BETWEEN 1 AND 100
    THEN
      RAISE EXCEPTION 'ORDER_INVALID: option shape';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_options) AS selected
    GROUP BY selected->>'group', selected->>'choice'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ORDER_INVALID: duplicate option';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_menu_item->'option_groups', '[]'::jsonb)) AS g
    WHERE g->'multiple' IS DISTINCT FROM 'true'::jsonb
      AND (SELECT count(*) FROM jsonb_array_elements(p_options) AS selected
           WHERE selected->>'group' = g->>'label') > 1
  ) THEN
    RAISE EXCEPTION 'ORDER_INVALID: single-choice group';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION qkit.validate_order_options(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
-- Keep payment-first numbering while restoring the shared stock lock.
CREATE OR REPLACE FUNCTION qkit.place_order(
  p_short_code      text,
  p_customer_name   text,
  p_items           jsonb,
  p_idempotency_key uuid,
  p_customer_phone  text DEFAULT NULL
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
  v_needs_accept boolean;
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

    PERFORM qkit.validate_order_options(menu_item, line->'options');

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
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe' AND v_total > 0;
  v_needs_accept := b.requires_arrival_confirm OR NOT b.print_enabled;

  IF v_expects_payment THEN
    v_number := NULL;
  ELSE
    UPDATE qkit.booths SET order_seq = order_seq + 1
    WHERE id = b.id RETURNING order_seq INTO v_seq;
    v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
  END IF;

  -- Paid orders no longer increment order_seq at creation. They still need
  -- the same booth lock as walkup/free orders before reading available stock.
  -- Rate-limit rows are insufficient: QR and walkup use different keys, and
  -- QR keys also change at the fixed-window boundary.
  PERFORM 1 FROM qkit.booths WHERE id = b.id FOR UPDATE;

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
    (CASE WHEN v_expects_payment OR v_needs_accept THEN 'pending' ELSE 'preparing' END)::qkit.order_status,
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

  -- Cross-kit customer identity: a genuinely optional convenience, not a
  -- required identity check — skipped entirely when the customer declined to
  -- give a phone, and guarded (see header) for the CI/local Postgres that has
  -- no merqo schema at all.
  IF p_customer_phone IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'upsert_customer'
    ) THEN
      PERFORM merqo.upsert_customer(b.vendor_id, p_customer_phone, p_customer_name);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;

-- Apply the same cart boundary to staff-entered orders.
CREATE OR REPLACE FUNCTION qkit.place_walkup_order(
  p_booth_id      uuid,
  p_customer_name text,
  p_items         jsonb,
  p_paid          boolean DEFAULT false,
  p_customer_phone text DEFAULT NULL
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

    PERFORM qkit.validate_order_options(menu_item, line->'options');

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
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe' AND v_total > 0;
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

  -- Same genuinely-optional, guarded cross-kit customer link as place_order
  -- above — walkup orders share the identical customer-write path (see this
  -- migration's header) so it gets the same treatment.
  IF p_customer_phone IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'upsert_customer'
    ) THEN
      PERFORM merqo.upsert_customer(b.vendor_id, p_customer_phone, p_customer_name);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;

-- Rate-limit the public feedback RPC after validating order possession.
CREATE OR REPLACE FUNCTION qkit.submit_feedback(
  p_source       text,
  p_booth_id     uuid    DEFAULT NULL,
  p_order_number text    DEFAULT NULL,
  p_rating       int     DEFAULT NULL,
  p_nps          int     DEFAULT NULL,
  p_message      text    DEFAULT NULL,
  p_access_token uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_vendor  uuid := NULL;
  v_message text;
BEGIN
  IF p_source NOT IN ('customer', 'vendor') THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: source';
  END IF;

  v_message := NULLIF(btrim(COALESCE(p_message, '')), '');
  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: message too long';
  END IF;
  IF p_order_number IS NOT NULL AND char_length(p_order_number) > 40 THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: order number';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: rating';
  END IF;
  IF p_nps IS NOT NULL AND (p_nps < 0 OR p_nps > 10) THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: nps';
  END IF;
  IF p_rating IS NULL AND p_nps IS NULL AND v_message IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: empty';
  END IF;

  IF p_source = 'vendor' THEN
    v_vendor := auth.uid();

    IF EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'submit_vendor_feedback'
    ) THEN
      PERFORM merqo.submit_vendor_feedback('qkit', p_nps, v_message);
    END IF;

    RETURN;
  END IF;

  IF p_booth_id IS NULL
     OR p_order_number IS NULL
     OR p_access_token IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM qkit.orders
       WHERE booth_id = p_booth_id
         AND order_number = p_order_number
         AND access_token = p_access_token
     )
  THEN
    RAISE EXCEPTION 'FEEDBACK_UNAUTHORIZED: order proof required';
  END IF;

  -- The order proof was checked before spending this order's review budget.
  -- Definer execution permits the private limiter, but direct callers cannot
  -- choose its key or bypass the cap by changing an IP/header.
  IF NOT qkit.check_rate_limit('feedback:order:' || p_access_token::text, 3, 300) THEN
    RAISE EXCEPTION 'FEEDBACK_RATE_LIMITED: order feedback limit';
  END IF;

  INSERT INTO qkit.feedback
    (source, vendor_id, booth_id, order_number, rating, message)
  VALUES
    (p_source, NULL, p_booth_id, NULLIF(p_order_number, ''), p_rating, v_message);
END;
$$;

REVOKE ALL ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text, uuid) TO anon, authenticated;

-- The shared deployment provides merqo.emit_metric; a standalone local qkit
-- schema does not. Skip only an absent integration, matching other guarded
-- cross-schema calls. A present function keeps the original transactional
-- behavior: its errors propagate instead of silently losing a business event.
CREATE OR REPLACE FUNCTION qkit.emit_order_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor_id uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'emit_metric'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT vendor_id INTO v_vendor_id
    FROM qkit.booths WHERE id = NEW.booth_id;

    IF v_vendor_id IS NOT NULL THEN
      PERFORM merqo.emit_metric(
        v_vendor_id, 'qkit', 'order_completed',
        jsonb_build_object('order_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

