-- Merge section-owned preferences under the caller's existing vendor RLS policies.
CREATE OR REPLACE FUNCTION qkit.patch_board_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_settings jsonb;
  merged jsonb;
  field text;
  value jsonb;
  minimum numeric;
  maximum numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid settings patch' USING ERRCODE = '22023';
  END IF;
  FOR field, value IN SELECT * FROM jsonb_each(p_patch) LOOP
    CASE field
      WHEN 'sound_id' THEN
        IF jsonb_typeof(value) <> 'string' OR value #>> '{}' NOT IN ('chime','bell','ding','horn','triple','none') THEN
          RAISE EXCEPTION 'Invalid sound' USING ERRCODE = '22023';
        END IF;
      WHEN 'desktop_notify', 'daily_order_number_reset', 'show_wait_estimate',
           'customer_telegram_notify_enabled', 'pickup_scan_enabled' THEN
        IF jsonb_typeof(value) <> 'boolean' THEN
          RAISE EXCEPTION 'Invalid boolean setting' USING ERRCODE = '22023';
        END IF;
      WHEN 'aging_min', 'overdue_min', 'undo_seconds', 'default_prep_minutes', 'ready_auto_clear_min' THEN
        IF value = 'null'::jsonb AND field IN ('default_prep_minutes', 'ready_auto_clear_min') THEN
          CONTINUE;
        END IF;
        IF jsonb_typeof(value) <> 'number' THEN
          RAISE EXCEPTION 'Invalid numeric setting' USING ERRCODE = '22023';
        END IF;
        minimum := CASE WHEN field = 'undo_seconds' THEN 2 ELSE 1 END;
        maximum := CASE WHEN field IN ('aging_min','overdue_min') THEN 240 WHEN field = 'undo_seconds' THEN 15 ELSE 60 END;
        IF (value #>> '{}')::numeric < minimum OR (value #>> '{}')::numeric > maximum
           OR mod((value #>> '{}')::numeric, 1) <> 0 THEN
          RAISE EXCEPTION 'Setting outside allowed range' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unknown setting' USING ERRCODE = '22023';
    END CASE;
  END LOOP;

  SELECT board_settings INTO current_settings FROM qkit.vendors
    WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor unavailable' USING ERRCODE = '42501';
  END IF;
  merged := current_settings || p_patch;
  IF jsonb_typeof(merged -> 'aging_min') IS DISTINCT FROM 'number'
     OR jsonb_typeof(merged -> 'overdue_min') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid stored timing settings' USING ERRCODE = '22023';
  END IF;
  IF (merged ->> 'overdue_min')::numeric <= (merged ->> 'aging_min')::numeric THEN
    RAISE EXCEPTION 'Overdue must be later than amber' USING ERRCODE = '22023';
  END IF;
  UPDATE qkit.vendors SET board_settings = merged WHERE id = auth.uid();
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION qkit.patch_board_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION qkit.patch_board_settings(jsonb) TO authenticated;
