-- ── Shared entitlement predicate (T25 / R2 / F19) ───────────────────────────
-- can_create_booth (0010) and booth_servable (0016) both answer "is this vendor
-- entitled to unlimited active booths right now?" — but they DRIFTED:
--   can_create_booth: licenses WHERE expires_at > now()          -- valid_from ignored
--   booth_servable:   licenses WHERE valid_from <= now() AND expires_at > now()
-- valid_from was added in 0015 (scheduled passes) and can_create_booth was never
-- updated, so a FUTURE-dated pass lifted the create-cap before the booth could
-- actually serve. Extract one predicate both call, so they can never disagree.
CREATE OR REPLACE FUNCTION qkit.vendor_entitled(p_vendor uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT
    (SELECT plan FROM qkit.vendors WHERE id = p_vendor) = 'pro'
    OR EXISTS (
      SELECT 1 FROM qkit.licenses
      WHERE vendor_id = p_vendor
        AND valid_from <= now() AND expires_at > now()
    );
$$;
-- Called only nested from the SECURITY DEFINER functions below (which run as the
-- owner), so no role needs direct EXECUTE.
REVOKE ALL ON FUNCTION qkit.vendor_entitled(uuid) FROM PUBLIC;

-- can_create_booth: unlimited when entitled, else the free one-booth rule.
CREATE OR REPLACE FUNCTION qkit.can_create_booth(p_vendor uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT
    qkit.vendor_entitled(p_vendor)
    OR (SELECT count(*) FROM qkit.booths WHERE vendor_id = p_vendor) = 0;
$$;

-- booth_servable: same semantics as 0016 (is_active AND (entitled OR the single
-- oldest active booth on free)), now sharing vendor_entitled for the first arm.
CREATE OR REPLACE FUNCTION qkit.booth_servable(p_booth_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  WITH b AS (
    SELECT id, vendor_id, is_active FROM qkit.booths WHERE id = p_booth_id
  )
  SELECT
    b.is_active
    AND (
      qkit.vendor_entitled(b.vendor_id)
      OR b.id = (
        SELECT id FROM qkit.booths
        WHERE vendor_id = b.vendor_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      )
    )
  FROM b;
$$;

-- ── payment_method_kind is a closed set (T23 / F16) ──────────────────────────
-- The column is plain TEXT; the Row type claims a 'pointer'|'paynow'|'stripe'
-- union and place_order only ever writes those (or NULL), but nothing enforced
-- it, so a direct booths PATCH + order write could forge an out-of-union value.
ALTER TABLE qkit.orders
  ADD CONSTRAINT orders_payment_method_kind_check
  CHECK (
    payment_method_kind IS NULL
    OR payment_method_kind IN ('pointer', 'paynow', 'stripe')
  );

-- ── Tighten a definer helper's grants (T39 / F24) ────────────────────────────
-- apply_order_stock_delta is invoked only by the orders_stock_sync trigger
-- (SECURITY DEFINER); it never needs a direct caller. Revoke the default PUBLIC
-- EXECUTE for consistency with the other internal helpers.
REVOKE EXECUTE ON FUNCTION qkit.apply_order_stock_delta(uuid, jsonb, int) FROM PUBLIC;
