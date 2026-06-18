-- Foreign keys aren't auto-indexed in Postgres, and these columns also drive RLS
-- policies + the hottest queries (order board, stats windows, booth lists).
-- Indexing RLS-policy columns is a documented Supabase win (up to ~100x at scale).

-- orders.booth_id: RLS (orders_vendor_select), board, status page, stats. The
-- composite also serves the stats rolling-window scans (booth_id + created_at).
CREATE INDEX IF NOT EXISTS orders_booth_created_idx
  ON public.orders (booth_id, created_at);

-- booths.vendor_id: RLS (booths_vendor_*) + "list this vendor's booths".
CREATE INDEX IF NOT EXISTS booths_vendor_idx
  ON public.booths (vendor_id);

-- events.vendor_id: FK, low traffic but cheap to cover for admin funnel reads.
CREATE INDEX IF NOT EXISTS events_vendor_idx
  ON public.events (vendor_id);
