-- The ONLY public read of a booth. SECURITY DEFINER so it can read booths while
-- anon's direct SELECT is revoked; returns a public-safe projection only (never
-- cost_cents, short_code, vendor_id, order_seq, payment internals).
CREATE OR REPLACE FUNCTION qkit.get_booth_for_order(p_short_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  safe_menu jsonb;
BEGIN
  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RETURN NULL;  -- unresolved / rotated-away code
  END IF;

  -- Strip cost_cents from every menu item; keep only available items.
  SELECT COALESCE(jsonb_agg(mi - 'cost_cents'), '[]'::jsonb)
  INTO safe_menu
  FROM jsonb_array_elements(b.menu_items) AS mi
  WHERE COALESCE((mi->>'available')::boolean, true);

  RETURN jsonb_build_object(
    'booth_id',   b.id,
    'name',       b.name,
    'image_url',  b.image_url,
    'hours',      b.hours,
    'is_active',  b.is_active,
    'servable',   qkit.booth_servable(b.id),
    'menu_items', safe_menu,
    'remaining',  qkit.booth_remaining_stock(b.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION qkit.get_booth_for_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.get_booth_for_order(text) TO anon, authenticated;

-- Close the column-leak: anon must not read booths directly anymore (this was how
-- access_token + cost_cents leaked). Vendor/admin reads use authenticated RLS.
REVOKE SELECT ON qkit.booths FROM anon;
