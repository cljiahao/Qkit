-- Rotate a booth's short code. SECURITY INVOKER (default) so the caller's RLS
-- (booths_vendor_update) applies — a vendor rotates only their own booth.
CREATE OR REPLACE FUNCTION qkit.regenerate_short_code(p_booth_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE n integer;
BEGIN
  UPDATE qkit.booths SET short_code = qkit.gen_short_code()
  WHERE id = p_booth_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION qkit.regenerate_short_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.regenerate_short_code(uuid) TO authenticated;
