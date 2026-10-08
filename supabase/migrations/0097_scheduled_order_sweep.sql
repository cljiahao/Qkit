-- Two clean-ups ran only from a vendor's open order board (a client poll in
-- realtime-order-board.tsx calling sweepAbandonedPayments and
-- sweepReadyOrders): cancelling QR orders never paid for, and clearing ready
-- orders past the vendor's auto-clear time. With no board open, neither ran.
-- An unpaid order then kept its per-item stock indefinitely, and a ready order
-- stayed on the public queue display with nobody left to collect it.
--
-- sweep_stale_orders does both for every vendor, and is scheduled below. The
-- board's own poll stays: it is quicker than a five-minute schedule while
-- someone is watching, and running both is harmless, since each only touches
-- rows the other has not already moved.
CREATE OR REPLACE FUNCTION qkit.sweep_stale_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
BEGIN
  -- Same rows as sweepAbandonedPayments: a customer-placed order still waiting
  -- at the payment step after 30 minutes (ABANDONED_PAYMENT_MS). Cancelling it
  -- returns its stock through the existing orders triggers.
  WITH swept AS (
    UPDATE qkit.orders
    SET status = 'cancelled'
    WHERE payment_status = 'pending'
      AND source = 'qr'
      AND status = 'pending'
      AND created_at < now() - interval '30 minutes'
    RETURNING id
  )
  INSERT INTO qkit.order_status_events (order_id, from_status, to_status)
  SELECT id, 'pending', 'cancelled' FROM swept;

  -- Same rows as sweepReadyOrders, per vendor: ready for longer than that
  -- vendor's board_settings.ready_auto_clear_min. A vendor with the setting
  -- off (null) or absent is skipped. The CASE keeps the cast from ever seeing
  -- a non-number, whatever order the planner evaluates the conditions in.
  WITH swept AS (
    UPDATE qkit.orders o
    SET status = 'completed',
        completed_at = now(),
        auto_completed = true
    FROM qkit.booths b
    JOIN qkit.vendors v ON v.id = b.vendor_id
    WHERE b.id = o.booth_id
      AND o.status = 'ready'
      AND o.ready_at < now() - make_interval(mins =>
        CASE
          WHEN jsonb_typeof(v.board_settings->'ready_auto_clear_min') = 'number'
          THEN (v.board_settings->>'ready_auto_clear_min')::numeric::int
        END)
    RETURNING o.id
  )
  INSERT INTO qkit.order_status_events (order_id, from_status, to_status)
  SELECT id, 'ready', 'completed' FROM swept;
END;
$$;

-- Not callable through the Data API: it acts on every vendor's orders.
REVOKE EXECUTE ON FUNCTION qkit.sweep_stale_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.sweep_stale_orders() TO service_role;

-- Every five minutes, through pg_cron. Scheduling is best-effort on purpose:
-- where pg_cron is unavailable or the role may not enable it, the function
-- above still exists and the board's poll still clears a watched board, so
-- the migration must not fail over it. A NOTICE says which case applied.
-- cron.schedule with a job name replaces a job of that name, so re-running
-- this is safe. Check with: SELECT jobname, schedule FROM cron.job;
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron is not available: qkit.sweep_stale_orders() is not scheduled';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'qkit-sweep-stale-orders',
    '*/5 * * * *',
    'SELECT qkit.sweep_stale_orders()'
  );
  RAISE NOTICE 'qkit.sweep_stale_orders() scheduled every 5 minutes';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'qkit.sweep_stale_orders() was not scheduled: %', SQLERRM;
END
$do$;
