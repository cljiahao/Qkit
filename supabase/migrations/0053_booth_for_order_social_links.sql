-- get_booth_for_order also returns the booth's effective social links, so
-- the customer menu page can show them even while the booth is closed.
-- Resolution mirrors resolveSocialLinks() in src/lib/schemas.ts: the
-- booth's own override (b.social_links) if set, else the vendor's profile
-- default (v.social_links) — whole-object, never merged per-key.
CREATE OR REPLACE FUNCTION qkit.get_booth_for_order(p_short_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_social jsonb;
  safe_menu jsonb;
BEGIN
  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RETURN NULL;  -- unresolved / rotated-away code
  END IF;

  SELECT social_links INTO v_social FROM qkit.vendors WHERE id = b.vendor_id;

  -- Strip cost_cents from every menu item; keep only available items.
  SELECT COALESCE(jsonb_agg(mi - 'cost_cents'), '[]'::jsonb)
  INTO safe_menu
  FROM jsonb_array_elements(b.menu_items) AS mi
  WHERE COALESCE((mi->>'available')::boolean, true);

  RETURN jsonb_build_object(
    'booth_id',     b.id,
    'name',         b.name,
    'image_url',    b.image_url,
    'hours',        b.hours,
    'is_active',    b.is_active,
    'servable',     qkit.booth_servable(b.id),
    'menu_items',   safe_menu,
    'remaining',    qkit.booth_remaining_stock(b.id),
    'social_links', COALESCE(b.social_links, v_social, '{}'::jsonb)
  );
END;
$$;
