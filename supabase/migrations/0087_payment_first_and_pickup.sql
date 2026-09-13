-- Payment-first checkout + self-checkout pickup kiosk.
-- See docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md

ALTER TABLE qkit.orders ALTER COLUMN order_number DROP NOT NULL;
ALTER TABLE qkit.orders ADD COLUMN payment_proof_path TEXT;
ALTER TABLE qkit.orders ADD COLUMN payment_proof_hash TEXT;

-- Duplicate-photo lookup is always scoped to one vendor (via booths), so
-- index the hash alone -- the join to booths.vendor_id at query time is
-- cheap against a small per-vendor order count, no composite index needed.
CREATE INDEX orders_payment_proof_hash_idx
  ON qkit.orders (payment_proof_hash)
  WHERE payment_proof_hash IS NOT NULL;

-- Private bucket: proof-of-payment screenshots are sensitive (partial bank
-- details), unlike booth-images. No anon/public policy at all; a vendor
-- reads their own via a scoped SELECT policy below, matching
-- booth-images' own per-vendor-folder pattern (migration 0002).
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {vendorId}/{orderId}.{ext} -- same folder-scoping
-- pattern booth_images_vendor_* policies already use.
CREATE POLICY "payment_proofs_vendor_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- No INSERT/UPDATE/DELETE policy for authenticated/anon -- every write goes
-- through claimPayment's service-role client, which bypasses RLS.

-- Atomic order-number assignment at claim time, mirroring place_order's
-- own increment + zero-pad pattern EXACTLY (not qkit.next_order_number,
-- migration 0008 -- that function is unused dead code with a truncation
-- bug: its lpad(v_seq::text, 4, '0') silently drops the leading digit once
-- a booth passes 9999 orders, since Postgres's lpad truncates a too-long
-- input from the left). Idempotent under a SEQUENTIAL retry (an
-- already-numbered order returns the existing number, no re-increment) AND
-- under a genuinely CONCURRENT double-call for the same order: the closing
-- UPDATE ... RETURNING tells the loser its own write did nothing, so it
-- re-reads and returns whatever the winner actually persisted instead of
-- the (unpersisted) number it locally computed.
CREATE OR REPLACE FUNCTION qkit.assign_order_number(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit, public
AS $$
DECLARE
  v_booth_id UUID;
  v_existing TEXT;
  v_seq INT;
  v_number TEXT;
  v_assigned TEXT;
BEGIN
  SELECT booth_id, order_number INTO v_booth_id, v_existing
  FROM qkit.orders WHERE id = p_order_id;

  IF v_booth_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = v_booth_id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  UPDATE qkit.orders SET order_number = v_number
  WHERE id = p_order_id AND order_number IS NULL
  RETURNING order_number INTO v_assigned;

  IF v_assigned IS NULL THEN
    -- Lost the race: a concurrent call already set a number between our own
    -- read above and this UPDATE. v_number was computed (and order_seq
    -- already burned) but never persisted -- return the number that
    -- actually won instead.
    SELECT order_number INTO v_assigned FROM qkit.orders WHERE id = p_order_id;
  END IF;

  RETURN v_assigned;
END;
$$;

GRANT EXECUTE ON FUNCTION qkit.assign_order_number(UUID) TO service_role;

-- The 0045 freeze trigger blocks ANY change to order_number, including the
-- one-time NULL -> assigned transition assign_order_number just performed
-- above -- it fires on every UPDATE regardless of role. Loosen it to allow
-- exactly that one transition (old value NULL) while still blocking any
-- change once a number is set, matching assign_order_number's own
-- write-only-when-NULL guard. Reproduces 0045's function verbatim (incl.
-- access_token, added there) + the one order_number condition change.
CREATE OR REPLACE FUNCTION qkit.orders_freeze_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = qkit
AS $$
BEGIN
  IF NEW.booth_id            IS DISTINCT FROM OLD.booth_id
    OR (OLD.order_number IS NOT NULL AND NEW.order_number IS DISTINCT FROM OLD.order_number)
    OR NEW.customer_name     IS DISTINCT FROM OLD.customer_name
    OR NEW.items             IS DISTINCT FROM OLD.items
    OR NEW.total_cents       IS DISTINCT FROM OLD.total_cents
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    OR NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key
    OR NEW.payment_method_kind IS DISTINCT FROM OLD.payment_method_kind
    OR NEW.access_token      IS DISTINCT FROM OLD.access_token
  THEN
    RAISE EXCEPTION 'ORDER_IMMUTABLE_COLUMN: financial/identity columns cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$;

-- place_order: gate numbering + status on whether the order requires payment.
-- Same body as 0086 with exactly two deltas: (1) skip numbering entirely for
-- a payment-required order -- numbering now happens at claim time via
-- qkit.assign_order_number above -- and (2) force status to 'pending' for a
-- payment-required order regardless of the booth's own accept-gate, since an
-- unpaid order must never auto-start into preparing.
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
