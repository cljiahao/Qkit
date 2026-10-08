-- Two stock controls a stall asked for after working to a fixed stock at an
-- event, both on top of the booth's daily total (booths.daily_cup_cap, 0094,
-- which counts every item the booth sells, whatever it is):
--
--   1. A limit on how many items one customer order may carry, so the first
--      person in the queue cannot take the whole tray.
--   2. A short hold on what a customer has put in their basket, so the next
--      customer is not offered the same last items and refused at checkout.

-- ── Per-order item limit ─────────────────────────────────────────────────────
ALTER TABLE qkit.booths
  ADD COLUMN IF NOT EXISTS max_items_per_order integer;

ALTER TABLE qkit.booths
  DROP CONSTRAINT IF EXISTS booths_max_items_per_order_range;
ALTER TABLE qkit.booths
  ADD CONSTRAINT booths_max_items_per_order_range
  CHECK (max_items_per_order IS NULL
         OR (max_items_per_order > 0 AND max_items_per_order <= 100));

COMMENT ON COLUMN qkit.booths.max_items_per_order IS
  'Most items (sum of item quantities) one customer-placed order may carry. '
  'NULL means no limit. Enforced by the orders_max_items_per_order trigger. '
  'Walk-up orders the vendor enters are exempt.';

-- booths has column-level INSERT/UPDATE grants (0091, 0095); a new column is
-- not covered by them until it is named.
GRANT INSERT (max_items_per_order), UPDATE (max_items_per_order)
  ON qkit.booths TO authenticated;

-- A trigger, like the daily total in 0094, so the rule covers every insert
-- path without re-emitting place_order. Only customer-placed orders are
-- limited: a vendor keying in a walk-up order is the one who set the limit and
-- can see the tray in front of them.
CREATE OR REPLACE FUNCTION qkit.enforce_max_items_per_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_max int;
  v_adding int;
BEGIN
  IF NEW.source IS DISTINCT FROM 'qr' THEN
    RETURN NEW;
  END IF;

  SELECT max_items_per_order INTO v_max FROM qkit.booths WHERE id = NEW.booth_id;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_adding
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item;

  IF v_adding > v_max THEN
    RAISE EXCEPTION 'ORDER_TOO_LARGE: order asks for % items, booth allows % per order',
      v_adding, v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_max_items_per_order ON qkit.orders;
CREATE TRIGGER orders_max_items_per_order
  BEFORE INSERT ON qkit.orders
  FOR EACH ROW
  EXECUTE FUNCTION qkit.enforce_max_items_per_order();

-- ── Basket holds ─────────────────────────────────────────────────────────────
-- One row per customer basket on a booth that limits stock. session_id is a
-- random id the customer's browser makes up; it identifies a basket, not a
-- person. items is {menu_item_id: quantity} and qty is its total.
--
-- A hold is deliberately SOFT. It lowers the stock other customers are shown
-- and can add to a basket, and nothing else: place_order and the two cap
-- triggers do not read this table, so stock a hold claims can still be bought
-- by an order that reaches the counter first. That is what keeps an anonymous,
-- unauthenticated write from being a way to take a booth offline: the worst a
-- flood of fake holds can do is show honest customers "in another basket" for
-- a few minutes, and it cannot cost the vendor a real sale or oversell stock.
CREATE TABLE IF NOT EXISTS qkit.cart_holds (
  booth_id   uuid NOT NULL REFERENCES qkit.booths(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  items      jsonb NOT NULL,
  qty        integer NOT NULL CHECK (qty > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (booth_id, session_id)
);

CREATE INDEX IF NOT EXISTS cart_holds_booth_expiry
  ON qkit.cart_holds (booth_id, expires_at);

-- No policies: only the SECURITY DEFINER functions below touch it (RLS on with
-- no policy denies every direct read and write).
ALTER TABLE qkit.cart_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qkit.cart_holds FROM PUBLIC, anon, authenticated;

-- What a customer can still add at this booth, net of what OTHER baskets are
-- holding. p_session is the caller's own basket, left out of the subtraction
-- so a customer is never blocked by their own hold; NULL subtracts every hold.
--
--   remaining     {menu_item_id: n} for items with a sold-out limit
--   held          {menu_item_id: n} of that, how many other baskets hold
--   left          items left in the booth's daily total, NULL when it has none
--   left_held     how many of the daily total other baskets hold
--   max_per_order the booth's per-order limit, NULL when it has none
--
-- Public (anon), like booth_cups_left: it exposes counts only, never the caps
-- themselves, another basket's contents, or any order detail.
CREATE OR REPLACE FUNCTION qkit.booth_availability(p_booth_id uuid, p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
DECLARE
  v_max int;
  v_stock jsonb;
  v_cups_left int;
  v_others jsonb;
  v_others_total int;
  v_remaining jsonb := '{}'::jsonb;
  v_held jsonb := '{}'::jsonb;
  v_left int;
  r record;
  v_other int;
BEGIN
  SELECT max_items_per_order INTO v_max FROM qkit.booths WHERE id = p_booth_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_stock := qkit.booth_remaining_stock(p_booth_id);
  v_cups_left := qkit.booth_cups_left(p_booth_id);

  SELECT COALESCE(jsonb_object_agg(s.k, s.q), '{}'::jsonb), COALESCE(SUM(s.q), 0)::int
  INTO v_others, v_others_total
  FROM (
    SELECT e.key AS k, SUM(e.value::int)::int AS q
    FROM qkit.cart_holds h, jsonb_each_text(h.items) AS e
    WHERE h.booth_id = p_booth_id
      AND h.expires_at > now()
      AND (p_session IS NULL OR h.session_id <> p_session)
    GROUP BY e.key
  ) AS s;

  FOR r IN SELECT key AS id, value::int AS stock FROM jsonb_each_text(v_stock) LOOP
    v_other := LEAST(COALESCE((v_others->>r.id)::int, 0), r.stock);
    v_remaining := v_remaining || jsonb_build_object(r.id, r.stock - v_other);
    IF v_other > 0 THEN
      v_held := v_held || jsonb_build_object(r.id, v_other);
    END IF;
  END LOOP;

  IF v_cups_left IS NOT NULL THEN
    v_left := GREATEST(v_cups_left - v_others_total, 0);
  END IF;

  RETURN jsonb_build_object(
    'remaining',     v_remaining,
    'held',          v_held,
    'left',          v_left,
    'left_held',     COALESCE(v_cups_left - v_left, 0),
    'max_per_order', v_max
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_availability(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_availability(uuid, uuid) TO anon, authenticated, service_role;

-- Replace the caller's hold with what is in their basket now, and return the
-- availability they should show. An empty basket releases the hold.
--
-- The grant is first come, first held: under a per-booth advisory lock the
-- request is cut down to what other baskets have not already claimed, so two
-- customers reaching for the last item cannot both be told it is theirs. The
-- caller reads the cut back from `remaining` / `left` and trims the basket.
--
-- Bounds on an unauthenticated write: a booth-scoped flood guard (the per-IP
-- guard lives in the server action, which a direct RPC call skips), a hold of
-- at most 50 items or the booth's per-order limit, a five-minute life that only
-- a change to the basket renews, and no row at all for a booth with nothing
-- capped. See the table comment for why a hold never blocks an order.
CREATE OR REPLACE FUNCTION qkit.hold_cart(p_booth_id uuid, p_session uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_avail jsonb;
  v_budget int;
  v_grant jsonb := '{}'::jsonb;
  v_total int := 0;
  v_take int;
  r record;
BEGIN
  SELECT * INTO b FROM qkit.booths WHERE id = p_booth_id;
  IF NOT FOUND OR p_session IS NULL THEN
    RETURN NULL;
  END IF;

  IF b.daily_cup_cap IS NULL
     AND qkit.booth_remaining_stock(b.id) = '{}'::jsonb THEN
    RETURN qkit.booth_availability(b.id, p_session);
  END IF;

  IF NOT qkit.check_rate_limit('hold:booth:' || b.id::text, 600, 60) THEN
    RETURN qkit.booth_availability(b.id, p_session);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qkit.cart_hold:' || b.id::text));

  DELETE FROM qkit.cart_holds WHERE booth_id = b.id AND expires_at <= now();

  v_avail := qkit.booth_availability(b.id, p_session);
  v_budget := LEAST(COALESCE(b.max_items_per_order, 50), 50);
  IF v_avail->>'left' IS NOT NULL THEN
    v_budget := LEAST(v_budget, (v_avail->>'left')::int);
  END IF;

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) <= 50 THEN
    -- Pooled per menu item, like the stock counter. A line that is not a
    -- whole-number quantity of an item on this booth's menu is ignored
    -- rather than raised on: a hold is advisory, and a malformed basket
    -- should cost the caller their hold, not an error page.
    FOR r IN
      SELECT it->>'menuItemId' AS id,
             SUM(LEAST(GREATEST((it->>'quantity')::numeric, 0), 50))::int AS want
      FROM jsonb_array_elements(p_items) AS it
      WHERE jsonb_typeof(it) = 'object'
        AND jsonb_typeof(it->'quantity') = 'number'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(b.menu_items) AS mi
          WHERE mi->>'id' = it->>'menuItemId'
        )
      GROUP BY it->>'menuItemId'
      ORDER BY it->>'menuItemId'
    LOOP
      v_take := LEAST(r.want, v_budget - v_total);
      IF v_avail->'remaining' ? r.id THEN
        v_take := LEAST(v_take, (v_avail->'remaining'->>r.id)::int);
      END IF;
      IF v_take > 0 THEN
        v_grant := v_grant || jsonb_build_object(r.id, v_take);
        v_total := v_total + v_take;
      END IF;
    END LOOP;
  END IF;

  IF v_total = 0 THEN
    DELETE FROM qkit.cart_holds WHERE booth_id = b.id AND session_id = p_session;
  ELSE
    INSERT INTO qkit.cart_holds (booth_id, session_id, items, qty, expires_at)
    VALUES (b.id, p_session, v_grant, v_total, now() + interval '5 minutes')
    ON CONFLICT (booth_id, session_id)
    DO UPDATE SET items = EXCLUDED.items,
                  qty = EXCLUDED.qty,
                  expires_at = EXCLUDED.expires_at;
  END IF;

  RETURN v_avail;
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) TO anon, authenticated, service_role;
