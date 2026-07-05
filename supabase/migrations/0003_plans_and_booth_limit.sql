-- ── Plans ────────────────────────────────────────────────────────────────────

-- One plan per vendor. Text + CHECK (not an enum) so 'event_pass' etc. can be
-- added later without an enum migration. Existing rows backfill to 'free'.
ALTER TABLE qkit.vendors
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'pro'));

-- ── Booth-limit RLS ──────────────────────────────────────────────────────────

-- booths_vendor_all is FOR ALL, so its USING also governs INSERT and can't
-- restrict it (permissive policies OR together). Split into per-command
-- policies so INSERT can be gated by plan.
DROP POLICY "booths_vendor_all" ON qkit.booths;

CREATE POLICY "booths_vendor_select" ON qkit.booths
  FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "booths_vendor_update" ON qkit.booths
  FOR UPDATE USING (vendor_id = auth.uid());

CREATE POLICY "booths_vendor_delete" ON qkit.booths
  FOR DELETE USING (vendor_id = auth.uid());

-- SECURITY DEFINER: reading booths inside a booths policy would otherwise raise
-- "infinite recursion detected in policy". Definer rights bypass RLS for the
-- count and plan lookup. search_path pinned to public to prevent hijacking.
CREATE OR REPLACE FUNCTION qkit.can_create_booth(p_vendor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT
    (SELECT plan FROM qkit.vendors WHERE id = p_vendor) = 'pro'
    OR (SELECT count(*) FROM qkit.booths WHERE vendor_id = p_vendor) = 0;
$$;

-- Free vendors may insert only while they have zero booths; pro = unlimited.
CREATE POLICY "booths_vendor_insert" ON qkit.booths
  FOR INSERT WITH CHECK (
    vendor_id = auth.uid()
    AND qkit.can_create_booth(auth.uid())
  );

-- booths_public_read (SELECT where is_active) is intentionally left untouched —
-- customer ordering pages still read active booths.
