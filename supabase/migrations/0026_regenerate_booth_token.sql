-- Rotate a booth's token to a fresh server-generated value. SECURITY INVOKER
-- (default) so the caller's RLS (booths_vendor_update) on booths still
-- applies — a vendor can only rotate their own booth. Returns the number of
-- rows touched (0 = not yours).
CREATE OR REPLACE FUNCTION public.regenerate_booth_token(p_booth_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.booths
     SET access_token = public.gen_booth_token()
   WHERE id = p_booth_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_booth_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_booth_token(uuid) TO authenticated;
