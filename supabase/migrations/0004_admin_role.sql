-- ── Admin role ───────────────────────────────────────────────────────────────

ALTER TABLE qkit.vendors
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- SECURITY DEFINER so it can read vendors.is_admin regardless of the caller's
-- RLS, and so referencing it inside a vendors policy doesn't recurse.
-- search_path pinned to public to prevent hijacking.
CREATE OR REPLACE FUNCTION qkit.is_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT coalesce(
    (SELECT is_admin FROM qkit.vendors WHERE id = p_uid),
    false
  );
$$;

-- Admins may read every vendor (the rest of the dashboard still scopes to self).
DROP POLICY "vendors_self_select" ON qkit.vendors;
CREATE POLICY "vendors_select" ON qkit.vendors
  FOR SELECT USING (auth.uid() = id OR qkit.is_admin(auth.uid()));

-- Admins may read all booths / orders (additive to the existing policies).
CREATE POLICY "booths_admin_select" ON qkit.booths
  FOR SELECT USING (qkit.is_admin(auth.uid()));

CREATE POLICY "orders_admin_select" ON qkit.orders
  FOR SELECT USING (qkit.is_admin(auth.uid()));

-- Grant yourself admin after applying:
--   update qkit.vendors set is_admin = true where id = '<your-user-id>';
