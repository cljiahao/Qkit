-- Rate-limiter cleanup cost (T9 / L2). check_rate_limit ran an unindexed
--   DELETE FROM rate_limits WHERE window_start < now() - INTERVAL '1 hour'
-- on EVERY call — a full scan on the hot order + payment-claim paths, where
-- almost every call finds nothing to delete. Two fixes:
--   1. Index window_start so the sweep is an index range scan, not a seq scan.
--   2. Only attempt the sweep on a small fraction of calls (random() < 0.02).
--      Under load, enough calls still trigger it to keep the table tiny; under
--      light load the table is tiny anyway. Avoids a pg_cron dependency (not
--      guaranteed enabled in every environment, incl. the pgTAP CI reset).

CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON public.rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count  INT;
BEGIN
  -- Floor now() to the start of the current fixed window.
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count)
    VALUES (p_key, v_window, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO v_count;

  -- Probabilistic cleanup: only ~2% of calls sweep expired windows, and the
  -- sweep is index-backed (rate_limits_window_start_idx). Keeps the table tiny
  -- without paying a DELETE scan on every single call.
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limits
      WHERE window_start < now() - INTERVAL '1 hour';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;
