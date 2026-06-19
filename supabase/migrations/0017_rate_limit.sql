-- DB-backed fixed-window rate limiter (no external infra). Used to throttle the
-- public anonymous order POST so a script can't flood a vendor's board.
-- check_rate_limit atomically counts hits for the current window and returns
-- false once the limit is exceeded. SECURITY DEFINER so anon can call it while
-- the table stays locked (no RLS policies = service/definer access only).

CREATE TABLE public.rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function (and service role) touch it.

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

  -- Opportunistic cleanup of windows older than an hour (keeps the table tiny).
  DELETE FROM public.rate_limits
    WHERE window_start < now() - INTERVAL '1 hour';

  RETURN v_count <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO anon, authenticated;
