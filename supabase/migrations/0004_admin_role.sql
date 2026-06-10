-- ── Admin role ───────────────────────────────────────────────────────────────

ALTER TABLE public.vendors
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- SECURITY DEFINER so it can read vendors.is_admin regardless of the caller's
-- RLS, and so referencing it inside a vendors policy doesn't recurse.
-- search_path pinned to public to prevent hijacking.
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT is_admin FROM public.vendors WHERE id = p_uid),
    false
  );
$$;

-- Admins may read every vendor (the rest of the dashboard still scopes to self).
DROP POLICY "vendors_self_select" ON public.vendors;
CREATE POLICY "vendors_select" ON public.vendors
  FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Admins may read all booths / orders (additive to the existing policies).
CREATE POLICY "booths_admin_select" ON public.booths
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "orders_admin_select" ON public.orders
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Grant yourself admin after applying:
--   update public.vendors set is_admin = true where id = '<your-user-id>';
