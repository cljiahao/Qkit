-- Booth serveability: a booth is orderable by customers only if its owner is
-- currently entitled to that many ACTIVE booths. Closes the leak where a vendor
-- buys a pass, creates many booths, and keeps them all serving after it expires.
--
-- Free → only the vendor's OLDEST active booth serves (others are paused: they
-- exist and the vendor can edit/toggle them, but customers can't order). The
-- vendor "swaps" which booth is live via is_active. Pass/Pro → all active serve.
-- Mirrors src/lib/booth-access.ts (servableBoothIds) so dashboard + DB agree.
--
-- SECURITY DEFINER bypasses RLS for the lookups (no recursion when called from a
-- booths policy), search_path pinned.
CREATE OR REPLACE FUNCTION qkit.booth_servable(p_booth_id UUID)
RETURNS BOOLEAN
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
      -- Unlimited active booths: permanent pro, or a live pass window.
      (SELECT plan FROM qkit.vendors v WHERE v.id = b.vendor_id) = 'pro'
      OR EXISTS (
        SELECT 1 FROM qkit.licenses l
        WHERE l.vendor_id = b.vendor_id
          AND l.valid_from <= now() AND l.expires_at > now()
      )
      -- Else free: only the single oldest active booth serves.
      OR b.id = (
        SELECT id FROM qkit.booths
        WHERE vendor_id = b.vendor_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      )
    )
  FROM b;
$$;

GRANT EXECUTE ON FUNCTION qkit.booth_servable(uuid) TO anon, authenticated;

-- Customer/public read now requires serveability (replaces the plain is_active
-- check). Vendor + admin SELECT policies are untouched, so the dashboard still
-- shows every booth (including paused ones).
DROP POLICY "booths_public_read" ON qkit.booths;
CREATE POLICY "booths_public_read" ON qkit.booths
  FOR SELECT USING (qkit.booth_servable(id));
