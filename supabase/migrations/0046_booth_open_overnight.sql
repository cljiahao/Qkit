-- Fix booth_open for weekly overnight windows.
--
-- 0044's booth_open (mirroring the old isBoothOpen) checked only the CURRENT
-- day's window. A weekly overnight shift (e.g. Fri 22:00-02:00) was wrongly
-- reported closed after midnight whenever the next day had no window of its own:
-- at Sat 01:00 it looked up Saturday (empty) and stopped, ignoring that Friday's
-- shift runs to Sat 02:00. Daily mode was unaffected (every day carries the same
-- window). This mirrors the corrected src/lib/hours.ts isBoothOpen.
--
-- New model: open now if EITHER today's window covers the evening/same-day part,
-- OR the PREVIOUS day's window is overnight and its after-midnight tail
-- [00:00, close) still covers now. For daily, "previous day" is the same window.
CREATE OR REPLACE FUNCTION public.booth_open(p_hours jsonb, p_now timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  sgt        timestamp;   -- SGT wall-clock (UTC+8, no DST)
  now_min    int;
  dow        int;
  keys       text[] := array['sun','mon','tue','wed','thu','fri','sat']; -- dow 0..6
  win_today  jsonb;
  win_prev   jsonb;
  t_open int; t_close int;
  p_open int; p_close int;
BEGIN
  IF p_hours IS NULL OR jsonb_typeof(p_hours) = 'null' THEN
    RETURN true;                       -- no schedule → open whenever active
  END IF;

  sgt := p_now AT TIME ZONE 'Asia/Singapore';
  now_min := extract(hour from sgt)::int * 60 + extract(minute from sgt)::int;

  IF p_hours->>'mode' = 'daily' THEN
    win_today := p_hours;              -- carries open/close at the top level
    win_prev  := p_hours;             -- daily: same window carries overnight
  ELSIF p_hours->>'mode' = 'weekly' THEN
    dow := extract(dow from sgt)::int; -- 0=Sun..6=Sat
    win_today := p_hours->'days'->keys[dow + 1];
    win_prev  := p_hours->'days'->keys[((dow + 6) % 7) + 1];
  ELSE
    RETURN true;                       -- unknown shape → don't block ordering
  END IF;

  -- Today's window, evening / same-day portion.
  IF win_today IS NOT NULL AND jsonb_typeof(win_today) <> 'null' THEN
    t_open  := split_part(win_today->>'open', ':', 1)::int * 60
             + split_part(win_today->>'open', ':', 2)::int;
    t_close := split_part(win_today->>'close', ':', 1)::int * 60
             + split_part(win_today->>'close', ':', 2)::int;
    IF t_open = t_close THEN
      RETURN true;                     -- degenerate window → open all day
    ELSIF t_close > t_open THEN
      IF now_min >= t_open AND now_min < t_close THEN RETURN true; END IF; -- normal
    ELSE
      IF now_min >= t_open THEN RETURN true; END IF;   -- overnight evening portion
    END IF;
  END IF;

  -- Previous day's window, overnight after-midnight carry.
  IF win_prev IS NOT NULL AND jsonb_typeof(win_prev) <> 'null' THEN
    p_open  := split_part(win_prev->>'open', ':', 1)::int * 60
             + split_part(win_prev->>'open', ':', 2)::int;
    p_close := split_part(win_prev->>'close', ':', 1)::int * 60
             + split_part(win_prev->>'close', ':', 2)::int;
    IF p_close < p_open AND now_min < p_close THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;
