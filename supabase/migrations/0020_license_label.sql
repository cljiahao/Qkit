-- Per-event stats: a vendor can name a paid pass (license) with their event-day
-- name and look back at that window's stats permanently — even after it expires.
-- Orders persist and are RLS-scoped to the vendor, so the data is always there;
-- this just adds a label and a safe way for the vendor to set it.

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS label TEXT
    CHECK (label IS NULL OR char_length(label) <= 80);

-- Vendors already have SELECT on their own licenses (licenses_vendor_select).
-- They must NOT get a blanket UPDATE (that could move expires_at and self-grant
-- Pro). Instead, a SECURITY DEFINER function sets ONLY the label, ONLY on a
-- license the caller owns.
CREATE OR REPLACE FUNCTION public.set_license_label(
  p_license_id UUID,
  p_label      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_label IS NOT NULL AND char_length(p_label) > 80 THEN
    RAISE EXCEPTION 'label too long';
  END IF;

  UPDATE public.licenses
     SET label = NULLIF(btrim(p_label), '')
   WHERE id = p_license_id
     AND vendor_id = auth.uid();  -- ownership check: no-op for others' rows
END;
$$;

REVOKE ALL ON FUNCTION public.set_license_label(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_license_label(UUID, TEXT) TO authenticated;
