-- Incremental sold-quantity counter per (booth, menu item). Maintained by
-- triggers on orders so booth_remaining_stock no longer scans full order history
-- on every customer page load / order submit.
CREATE TABLE public.booth_item_sold (
  booth_id     UUID NOT NULL REFERENCES public.booths(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (booth_id, menu_item_id)
);
ALTER TABLE public.booth_item_sold ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER functions/triggers touch it; anon/authenticated
-- have no direct access (RLS on + no policy = deny all direct access).

-- Apply a signed delta for every line in an order's items JSON.
CREATE OR REPLACE FUNCTION public.apply_order_stock_delta(
  p_booth_id uuid, p_items jsonb, p_sign int
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.booth_item_sold (booth_id, menu_item_id, qty)
  SELECT p_booth_id,
         it->>'menuItemId',
         p_sign * sum((it->>'quantity')::int)
  FROM jsonb_array_elements(p_items) AS it
  GROUP BY it->>'menuItemId'
  ON CONFLICT (booth_id, menu_item_id)
  DO UPDATE SET qty = GREATEST(public.booth_item_sold.qty + EXCLUDED.qty, 0);
$$;

-- SECURITY DEFINER: the triggering statement runs as anon (customer INSERT) or
-- authenticated (vendor cancel), but booth_item_sold is RLS deny-all — so the
-- nested write must run as the function owner or the whole order INSERT/UPDATE
-- rolls back. The nested apply_order_stock_delta inherits this definer context.
-- Safe: a RETURNS trigger function can't be called directly outside trigger context.
CREATE OR REPLACE FUNCTION public.orders_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status <> 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, 1);
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Only status transitions in/out of 'cancelled' change sold counts.
    IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, -1);
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      PERFORM public.apply_order_stock_delta(NEW.booth_id, NEW.items, 1);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER orders_stock_sync_ins
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_stock_sync();
CREATE TRIGGER orders_stock_sync_upd
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_stock_sync();

-- Backfill from existing non-cancelled orders.
INSERT INTO public.booth_item_sold (booth_id, menu_item_id, qty)
SELECT o.booth_id, it->>'menuItemId', sum((it->>'quantity')::int)
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items) AS it
WHERE o.status <> 'cancelled'
GROUP BY o.booth_id, it->>'menuItemId'
ON CONFLICT (booth_id, menu_item_id) DO UPDATE SET qty = EXCLUDED.qty;

-- Rewrite remaining-stock to read the counter (same signature + return shape).
CREATE OR REPLACE FUNCTION public.booth_remaining_stock(p_booth_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH caps AS (
    SELECT mi->>'id' AS menu_item_id, (mi->>'stock')::INT AS stock
    FROM public.booths b
    CROSS JOIN LATERAL jsonb_array_elements(b.menu_items) AS mi
    WHERE b.id = p_booth_id
      AND jsonb_typeof(mi->'stock') = 'number'
  )
  SELECT COALESCE(
    jsonb_object_agg(
      caps.menu_item_id,
      GREATEST(caps.stock - COALESCE(s.qty, 0), 0)
    ),
    '{}'::JSONB
  )
  FROM caps
  LEFT JOIN public.booth_item_sold s
    ON s.booth_id = p_booth_id AND s.menu_item_id = caps.menu_item_id;
$$;
