-- WITH CHECK on the remaining vendor/admin UPDATE policies (T7 / F15), same
-- class as the orders fix in 0032: a policy with only USING filters which rows
-- may be updated but does NOT constrain the RESULT row, so an UPDATE can move a
-- row OUT of the caller's ownership (re-point vendor_id / id to someone else).
-- Add WITH CHECK mirroring each USING so the post-update row must still belong
-- to the caller.

-- vendors: a vendor may update its own row, and the result must still be its own.
DROP POLICY IF EXISTS "vendors_self_update" ON public.vendors;
CREATE POLICY "vendors_self_update" ON public.vendors
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Privilege escalation, adjacent to the same policy: `plan` is a plain column on
-- a vendor's OWN row, so vendors_self_update (row-scoped, no column limit) let a
-- vendor `UPDATE vendors SET plan='pro'` on themselves via a direct PostgREST
-- call — a free→pro escalation. WITH CHECK can't express "plan unchanged"
-- (it sees only NEW). The only legitimate writer of `plan` is the admin action,
-- which uses the service role (bypasses column grants), so revoke column-level
-- UPDATE(plan) from the customer-facing roles. Vendor self-edits (name) and the
-- onboarding tour (tour_seen_at) don't touch `plan`, so they're unaffected.
REVOKE UPDATE (plan) ON public.vendors FROM anon, authenticated;

-- booths: a vendor updates its own booth; the result must still be its own
-- (prevents re-pointing a booth to another vendor).
DROP POLICY IF EXISTS "booths_vendor_update" ON public.booths;
CREATE POLICY "booths_vendor_update" ON public.booths
  FOR UPDATE
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());

-- purchase_requests: admin-only UPDATE; result must remain admin-consistent.
DROP POLICY IF EXISTS "purchase_requests_admin_update" ON public.purchase_requests;
CREATE POLICY "purchase_requests_admin_update" ON public.purchase_requests
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
