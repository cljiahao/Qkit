-- Ordered menu sections (e.g. "Drinks", "Mains"): a JSONB array of
-- {id, label} objects. Each menu_items entry may reference one by id via
-- its own "category" key (added client-side, not a DB column — menu_items
-- stays a flat JSONB array) — a stable id so renaming a section never
-- requires rewriting every item that references it. An item with no/unknown
-- category id renders in an "Other" bucket, always last. Default '[]'
-- preserves today's single flat menu list for every existing booth until a
-- vendor opts in.
ALTER TABLE qkit.booths
  ADD COLUMN menu_categories jsonb NOT NULL DEFAULT '[]'::jsonb;

-- get_booth_for_order also returns menu_categories so the customer menu page
-- can group items by section in the same round trip that already fetches
-- the menu — no second fetch for a "full" order-ready menu. Mirrors
-- 0053's pattern of extending this function's jsonb_build_object.
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
