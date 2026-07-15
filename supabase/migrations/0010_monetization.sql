-- ── Per-event licenses ───────────────────────────────────────────────────────

-- A license is a time-boxed Pro window. No event_id: the window is account-wide
-- (qkit has no real-world "event" entity). "active" is COMPUTED (expires_at >
-- now()), never stored, so it can't drift out of sync. Minted only by the
-- service-role admin action today; a Stripe webhook will insert the same shape
-- later (source = 'stripe').
CREATE TABLE qkit.licenses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'admin_manual',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX licenses_vendor_expiry_idx
  ON qkit.licenses (vendor_id, expires_at DESC);

ALTER TABLE qkit.licenses ENABLE ROW LEVEL SECURITY;

-- Vendors read their own licenses (countdown, history). No insert/update/delete
-- policy: licenses are minted only through the service-role client, which
-- bypasses RLS. Admins read via the same admin widening pattern as elsewhere.
CREATE POLICY "licenses_vendor_select" ON qkit.licenses
  FOR SELECT USING (vendor_id = auth.uid() OR qkit.is_admin(auth.uid()));

-- ── Admin-editable pricing ───────────────────────────────────────────────────

-- Single-row pricing config so the offer page can show live prices and admins
-- can tune them without a deploy. id is pinned to 1.
CREATE TABLE qkit.pricing (
  id               INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  event_pass_cents INT         NOT NULL DEFAULT 0,
  monthly_cents    INT         NOT NULL DEFAULT 0,
  currency         TEXT        NOT NULL DEFAULT 'SGD',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO qkit.pricing (id, event_pass_cents, monthly_cents)
  VALUES (1, 1500, 4900)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE qkit.pricing ENABLE ROW LEVEL SECURITY;

-- Prices aren't secret — anyone may read (the offer page is behind auth, but a
-- public read keeps it simple and leaks nothing). Writes go through the
-- service-role admin action only (no write policy).
CREATE POLICY "pricing_public_select" ON qkit.pricing
  FOR SELECT USING (true);

-- ── Booth-limit gate: honour an active license ───────────────────────────────

-- Redefine can_create_booth (from 0003) so a live license also lifts the
-- 1-booth-on-free cap, not just permanent pro. Otherwise a pass-holder would be
-- blocked by RLS even though the app grants them the pass tier.
CREATE OR REPLACE FUNCTION qkit.can_create_booth(p_vendor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT
    (SELECT plan FROM qkit.vendors WHERE id = p_vendor) = 'pro'
    OR EXISTS (
      SELECT 1 FROM qkit.licenses
      WHERE vendor_id = p_vendor AND expires_at > now()
    )
    OR (SELECT count(*) FROM qkit.booths WHERE vendor_id = p_vendor) = 0;
$$;

-- ── Sold-out stock: remaining per capped item ────────────────────────────────

-- Returns { menuItemId: remaining } for items that carry a `stock` cap. Items
-- with no cap are omitted (= unlimited). remaining = stock − sum(quantity across
-- non-cancelled orders), floored at 0, so a cancelled/amended-down order
-- automatically returns its stock. SECURITY DEFINER: anon customer pages call
-- this to render "N left", but it exposes only counts — never order PII.
CREATE OR REPLACE FUNCTION qkit.booth_remaining_stock(p_booth_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  WITH caps AS (
    SELECT mi->>'id' AS menu_item_id, (mi->>'stock')::INT AS stock
    FROM qkit.booths b
    CROSS JOIN LATERAL jsonb_array_elements(b.menu_items) AS mi
    WHERE b.id = p_booth_id
      AND jsonb_typeof(mi->'stock') = 'number'
  ),
  sold AS (
    SELECT it->>'menuItemId' AS menu_item_id,
           sum((it->>'quantity')::INT) AS qty
    FROM qkit.orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items) AS it
    WHERE o.booth_id = p_booth_id
      AND o.status <> 'cancelled'
    GROUP BY it->>'menuItemId'
  )
  SELECT COALESCE(
    jsonb_object_agg(
      caps.menu_item_id,
      GREATEST(caps.stock - COALESCE(sold.qty, 0), 0)
    ),
    '{}'::JSONB
  )
  FROM caps
  LEFT JOIN sold ON sold.menu_item_id = caps.menu_item_id;
$$;
