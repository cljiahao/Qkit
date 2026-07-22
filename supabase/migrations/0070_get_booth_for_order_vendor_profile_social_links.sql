-- 0069 dropped qkit.vendors.social_links, but get_booth_for_order (0053,
-- last redefined by 0066) still read its vendor-level social_links fallback
-- from that now-gone column — missed by 0069's own review, which only
-- audited app code, not this function. Stall name/social links have lived
-- in merqo.vendor_profile since the 2026-07-17 cutover (see 0069's own
-- comment), and qkit already reads that table directly in the one-time 0054
-- backfill, so a direct cross-schema SELECT here matches precedent — qkit
-- and merqo share one Postgres project, so this is a same-database read,
-- not a cross-service call. A vendor with no merqo.vendor_profile row yet
-- just resolves v_social to NULL, which the existing
-- COALESCE(b.social_links, v_social, '{}'::jsonb) already handles.
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

  SELECT social_links INTO v_social FROM merqo.vendor_profile WHERE vendor_id = b.vendor_id;

  -- Strip cost_cents from every menu item; keep only available items.
  SELECT COALESCE(jsonb_agg(mi - 'cost_cents'), '[]'::jsonb)
  INTO safe_menu
  FROM jsonb_array_elements(b.menu_items) AS mi
  WHERE COALESCE((mi->>'available')::boolean, true);

  RETURN jsonb_build_object(
    'booth_id',        b.id,
    'name',            b.name,
    'image_url',       b.image_url,
    'hours',           b.hours,
    'is_active',       b.is_active,
    'servable',        qkit.booth_servable(b.id),
    'menu_items',      safe_menu,
    'menu_categories', b.menu_categories,
    'remaining',       qkit.booth_remaining_stock(b.id),
    'social_links',    COALESCE(b.social_links, v_social, '{}'::jsonb)
  );
END;
$$;
