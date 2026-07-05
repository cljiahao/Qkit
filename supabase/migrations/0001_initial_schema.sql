-- ── Tables ──────────────────────────────────────────────────────────────────

-- Vendors: one row per auth user who is a vendor
CREATE TABLE qkit.vendors (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Booths: a vendor can have multiple booths
CREATE TABLE qkit.booths (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  menu_items  JSONB       NOT NULL DEFAULT '[]'::JSONB,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order status enum
CREATE TYPE qkit.order_status AS ENUM (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled'
);

-- Orders
CREATE TABLE qkit.orders (
  id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id       UUID                  NOT NULL REFERENCES qkit.booths(id),
  order_number   TEXT                  NOT NULL,
  customer_name  TEXT                  NOT NULL,
  items          JSONB                 NOT NULL,
  status         qkit.order_status   NOT NULL DEFAULT 'pending',
  total_cents    INTEGER               NOT NULL CHECK (total_cents >= 0),
  created_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  UNIQUE (booth_id, order_number)
);

-- Auto-update updated_at on every order update
CREATE OR REPLACE FUNCTION qkit.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON qkit.orders
  FOR EACH ROW EXECUTE FUNCTION qkit.update_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE qkit.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE qkit.booths  ENABLE ROW LEVEL SECURITY;
ALTER TABLE qkit.orders  ENABLE ROW LEVEL SECURITY;

-- vendors: each vendor only sees and edits their own row
CREATE POLICY "vendors_self_select" ON qkit.vendors
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "vendors_self_insert" ON qkit.vendors
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "vendors_self_update" ON qkit.vendors
  FOR UPDATE USING (auth.uid() = id);

-- booths: vendors manage their own; anyone can read active booths (customer ordering pages)
CREATE POLICY "booths_vendor_all" ON qkit.booths
  FOR ALL USING (vendor_id = auth.uid());

CREATE POLICY "booths_public_read" ON qkit.booths
  FOR SELECT USING (is_active = true);

-- orders:
--   • vendors read + update orders that belong to their booths
--   • anyone can INSERT (customers placing orders)
--   • order status page reads via service-role key (bypasses RLS) — no public SELECT needed
CREATE POLICY "orders_vendor_select" ON qkit.orders
  FOR SELECT USING (
    booth_id IN (
      SELECT id FROM qkit.booths WHERE vendor_id = auth.uid()
    )
  );

CREATE POLICY "orders_vendor_update" ON qkit.orders
  FOR UPDATE USING (
    booth_id IN (
      SELECT id FROM qkit.booths WHERE vendor_id = auth.uid()
    )
  );

CREATE POLICY "orders_public_insert" ON qkit.orders
  FOR INSERT WITH CHECK (true);

-- ── Realtime ─────────────────────────────────────────────────────────────────

-- Allow the dashboard and order-status page to subscribe to order changes.
ALTER PUBLICATION supabase_realtime ADD TABLE qkit.orders;
