-- An event with a fixed stock ("200 cups, then we stop") had no way to stop
-- taking orders at that line. booths.hours only closes a booth at a wall-clock
-- time, and an order count is not a cup count: a single order can carry four
-- or five cups, so a vendor capping orders either turns customers away early
-- or blows past the stock.
--
-- daily_cup_cap is the booth's limit on cups served in one SGT day, counted as
-- the sum of item quantities over the day's non-cancelled orders. NULL (every
-- existing booth) means no cap, exactly as before.
ALTER TABLE qkit.booths
  ADD COLUMN IF NOT EXISTS daily_cup_cap integer;

ALTER TABLE qkit.booths
  DROP CONSTRAINT IF EXISTS booths_daily_cup_cap_range;
ALTER TABLE qkit.booths
  ADD CONSTRAINT booths_daily_cup_cap_range
  CHECK (daily_cup_cap IS NULL OR (daily_cup_cap > 0 AND daily_cup_cap <= 100000));

COMMENT ON COLUMN qkit.booths.daily_cup_cap IS
  'Cups the booth will serve in one SGT day (sum of item quantities over the '
  'day''s non-cancelled orders). NULL means no cap. Enforced by the '
  'orders_daily_cup_cap trigger, not by app code.';

-- Cups already committed today, in SGT. Cancelled orders free their cups back
-- up: a vendor who cancels a mistaken order should not lose stock to it.
-- A pending-payment order still holds its cups, so an unpaid cart cannot be
-- used to oversell the last of the stock; qkit.sweep_abandoned_payments
-- cancels those after 30 minutes, which returns them.
CREATE OR REPLACE FUNCTION qkit.booth_cups_today(p_booth_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = p_booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
                          AT TIME ZONE 'Asia/Singapore';
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) TO anon, authenticated, service_role;

-- Enforced in a trigger rather than inside place_order/place_walkup_order so
-- every insert path is covered by one rule, including a future one, and so
-- neither 200-line function has to be re-emitted to add a check.
--
-- The advisory lock is what makes the cap a real limit instead of a race: two
-- customers checking out on the last five cups would otherwise both read the
-- same count and both pass. It is a transaction-scoped lock keyed on the booth,
-- so it serialises only inserts for the same booth, and only for a booth that
-- actually has a cap.
CREATE OR REPLACE FUNCTION qkit.enforce_daily_cup_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_cap int;
  v_used int;
  v_adding int;
BEGIN
  SELECT daily_cup_cap INTO v_cap FROM qkit.booths WHERE id = NEW.booth_id;
  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qkit.cup_cap:' || NEW.booth_id::text));

  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_adding
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item;

  -- Counted inline rather than through qkit.booth_cups_today, which is STABLE
  -- and so would answer from the firing statement's snapshot: that snapshot
  -- predates the advisory lock, so an order that committed while this
  -- transaction waited for the lock would be invisible and the cap would be
  -- overshot by exactly the race the lock is there to prevent. This trigger
  -- function is VOLATILE, so its own query takes a fresh snapshot under
  -- READ COMMITTED.
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_used
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = NEW.booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
                          AT TIME ZONE 'Asia/Singapore';

  IF v_used + v_adding > v_cap THEN
    RAISE EXCEPTION 'ORDER_CAP_REACHED: % of % cups served today, order asks for %',
      v_used, v_cap, v_adding;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_daily_cup_cap ON qkit.orders;
CREATE TRIGGER orders_daily_cup_cap
  BEFORE INSERT ON qkit.orders
  FOR EACH ROW
  EXECUTE FUNCTION qkit.enforce_daily_cup_cap();

-- Cups the booth can still serve today, or NULL when it has no cap. Public
-- (anon) so the customer's menu page can say "6 cups left today" or stop
-- taking orders outright, instead of letting someone build a cart and get
-- refused at checkout. It exposes only this single number, never the cap
-- itself or any order detail.
CREATE OR REPLACE FUNCTION qkit.booth_cups_left(p_booth_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT GREATEST(b.daily_cup_cap - qkit.booth_cups_today(b.id), 0)
  FROM qkit.booths b
  WHERE b.id = p_booth_id
    AND b.daily_cup_cap IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_cups_left(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_cups_left(uuid) TO anon, authenticated, service_role;
