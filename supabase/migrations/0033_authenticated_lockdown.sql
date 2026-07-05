-- Authenticated-role lockdown (Phase A.2 / T1). Phase A (0027–0031) closed the
-- customer write path for the `anon` role only. But sign-up is open, so the
-- `authenticated` role is attacker-reachable, and every Phase-A gap was left
-- open for it: the permissive INSERT/SELECT policies have no `TO` clause (they
-- apply to authenticated too), and the REVOKEs named only `anon`. A logged-in
-- JWT could therefore: forge orders (orders_public_insert WITH CHECK(true)),
-- read every servable booth's cost_cents + short_code (booths_public_read),
-- forge competitor feedback (feedback_public_insert WITH CHECK(true)), and burn
-- any booth's order_seq (next_order_number). This migration removes the dead
-- permissive policies, revokes the direct grants from BOTH roles, routes public
-- feedback through a SECURITY DEFINER RPC, and hardens place_order against the
-- direct-RPC path (which skips the server actions' validation + flood guard).

-- ── 1. Orders: the RPC is the only write path ────────────────────────────────
-- place_order is SECURITY DEFINER (runs as owner, bypasses RLS), so no INSERT
-- policy is needed. orders_public_insert (WITH CHECK true, no TO clause) only
-- served the now-removed direct path and let any authenticated JWT forge orders.
DROP POLICY IF EXISTS "orders_public_insert" ON qkit.orders;
REVOKE INSERT ON qkit.orders FROM anon, authenticated;

-- ── 2. Booths: no public table read for anyone ───────────────────────────────
-- Customers read booths via get_booth_for_order (SECURITY DEFINER, public-safe
-- projection); vendors read their own via booths_vendor_all. booths_public_read
-- (USING booth_servable(id)) is now reachable ONLY by authenticated, where it
-- leaked every servable booth's cost_cents + short_code cross-vendor. anon's
-- table SELECT was already revoked in 0029; drop the vestigial policy too.
DROP POLICY IF EXISTS "booths_public_read" ON qkit.booths;

-- ── 3. Feedback: close WITH CHECK(true), add a SECURITY DEFINER insert RPC ────
-- feedback_public_insert (WITH CHECK true) let any JWT forge reviews / pollute
-- admin NPS. Remove it and revoke the direct grant; submit_feedback becomes the
-- only insert path. It re-derives vendor_id from the caller's own session and
-- re-validates the payload in-DB so a direct RPC call can't bypass the Zod layer.
DROP POLICY IF EXISTS "feedback_public_insert" ON qkit.feedback;
REVOKE INSERT ON qkit.feedback FROM anon, authenticated;

CREATE OR REPLACE FUNCTION qkit.submit_feedback(
  p_source       text,
  p_booth_id     uuid    DEFAULT NULL,
  p_order_number text    DEFAULT NULL,
  p_rating       int     DEFAULT NULL,
  p_nps          int     DEFAULT NULL,
  p_message      text    DEFAULT NULL
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

  -- Mirror the table CHECKs + feedbackSchema so the direct-RPC path is bounded.
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
  -- Require at least a score or a message (feedbackSchema.refine).
  IF p_rating IS NULL AND p_nps IS NULL AND v_message IS NULL THEN
    RAISE EXCEPTION 'FEEDBACK_INVALID: empty';
  END IF;

  -- vendor_id comes from the caller's own JWT (auth.uid() is the subject even
  -- inside SECURITY DEFINER) — never trusted from a param.
  IF p_source = 'vendor' THEN
    v_vendor := auth.uid();
  END IF;

  INSERT INTO qkit.feedback
    (source, vendor_id, booth_id, order_number, rating, nps, message)
  VALUES
    (p_source, v_vendor, p_booth_id, NULLIF(p_order_number, ''),
     p_rating, p_nps, v_message);
END;
$$;

REVOKE ALL ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.submit_feedback(text, uuid, text, int, int, text) TO anon, authenticated;

-- ── 4. next_order_number: superseded, close it for authenticated too ─────────
-- place_order inlines numbering; next_order_number is dead in prod. It is
-- SECURITY DEFINER with no ownership check, so leaving EXECUTE would let any
-- authenticated JWT burn any booth's order_seq. anon was revoked in 0030.
REVOKE EXECUTE ON FUNCTION qkit.next_order_number(uuid) FROM authenticated;

-- ── 5. Harden place_order against the direct-RPC path ────────────────────────
-- The server action validates + flood-guards, but place_order is GRANT EXECUTE
-- to anon/authenticated, so a direct RPC call skips all of it. Re-derive the
-- persisted item name from the stored menu (V2), validate + cap options against
-- the item's option groups (V3), reject a cart that prices to nothing (V6),
-- cap the line count, and carry a booth-scoped flood guard inside the RPC (V1).
-- Also: only persist cost_cents when the menu item actually carries one — the
-- old COALESCE(...,0) wrote cost_cents:0 for every no-cost item, which made the
-- margin stats read 100% for every such vendor (T2). A genuine cost of 0 is
-- preserved (0 is distinct from absent).
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

  -- Booth-scoped flood guard INSIDE the RPC (V1): the per-IP guard lives in the
  -- server action, which a direct RPC call skips. This bounds total order churn
  -- on any one booth regardless of caller. Generous vs. a real busy stall.
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

  v_remaining := qkit.booth_remaining_stock(b.id);

  -- Stock is pooled per menu item across lines (option variants share a cap).
  -- Gated once, aggregated, before pricing — a per-line check would let two
  -- lines of the same capped item each pass individually while their sum
  -- oversells the cap.
  DECLARE
    r record;
  BEGIN
    FOR r IN
      -- Clamp per line to match the pricing loop (which skips qty<=0); an
      -- unclamped negative line on the direct-RPC path could mask an oversell.
      SELECT it->>'menuItemId' AS id, sum(GREATEST((it->>'quantity')::int, 0)) AS want
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
  -- server-authoritative name + price_cents (+ cost_cents only when set).
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

    -- Validate + cap the chosen options against the item's stored option groups
    -- (matched by label, the shape the customizer emits). Caps live only in Zod
    -- otherwise, so the direct-RPC path could inject unbounded / junk options.
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
    -- NULL when the item carries no cost (absent key) → cost_cents is omitted
    -- below so the margin stats don't treat a no-cost vendor as 100% margin.
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

  -- Every line priced to nothing (all qty 0) → a real $0 order that would still
  -- burn an order number. Reject it (V6).
  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  -- Payment snapshot (mirror of the old app logic; 'stripe' is dark → no online pay).
  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe';

  -- Atomic order number (row-locks the booth counter).
  UPDATE qkit.booths SET order_seq = order_seq + 1
  WHERE id = b.id RETURNING order_seq INTO v_seq;
  v_number := lpad(v_seq::text, 4, '0');

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
