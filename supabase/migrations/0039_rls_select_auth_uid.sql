-- T28 / L8 — planner-cache auth.uid() in every RLS policy. Postgres re-evaluates
-- a bare `auth.uid()` in a policy expression once PER ROW; wrapping it in a
-- scalar subquery `(select auth.uid())` makes the planner hoist it to a one-shot
-- initPlan (evaluated once per query). The expressions are otherwise semantically
-- identical, so row-level isolation is unchanged — the existing pgTAP suite
-- re-exercises every policy below and must still pass. Where auth.uid() is an
-- ARGUMENT to a STABLE helper (is_admin / can_create_booth), the wrap goes on the
-- argument so the whole call becomes a stable one-shot expression.
--
-- Scope: public-schema policies. The storage.objects booth-image policies keep
-- their bare auth.uid() — a vendor evaluates them over a handful of image rows,
-- so there's no scan to optimize, and they're outside the pgTAP suite's reach.

-- ── vendors ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vendors_select" ON public.vendors;
CREATE POLICY "vendors_select" ON public.vendors
  FOR SELECT USING (
    (select auth.uid()) = id OR public.is_admin((select auth.uid()))
  );

DROP POLICY IF EXISTS "vendors_self_insert" ON public.vendors;
CREATE POLICY "vendors_self_insert" ON public.vendors
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "vendors_self_update" ON public.vendors;
CREATE POLICY "vendors_self_update" ON public.vendors
  FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ── booths ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "booths_vendor_select" ON public.booths;
CREATE POLICY "booths_vendor_select" ON public.booths
  FOR SELECT USING (vendor_id = (select auth.uid()));

DROP POLICY IF EXISTS "booths_vendor_update" ON public.booths;
CREATE POLICY "booths_vendor_update" ON public.booths
  FOR UPDATE
  USING (vendor_id = (select auth.uid()))
  WITH CHECK (vendor_id = (select auth.uid()));

DROP POLICY IF EXISTS "booths_vendor_delete" ON public.booths;
CREATE POLICY "booths_vendor_delete" ON public.booths
  FOR DELETE USING (vendor_id = (select auth.uid()));

DROP POLICY IF EXISTS "booths_vendor_insert" ON public.booths;
CREATE POLICY "booths_vendor_insert" ON public.booths
  FOR INSERT WITH CHECK (
    vendor_id = (select auth.uid())
    AND public.can_create_booth((select auth.uid()))
  );

DROP POLICY IF EXISTS "booths_admin_select" ON public.booths;
CREATE POLICY "booths_admin_select" ON public.booths
  FOR SELECT USING (public.is_admin((select auth.uid())));

-- ── orders ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_vendor_select" ON public.orders;
CREATE POLICY "orders_vendor_select" ON public.orders
  FOR SELECT USING (
    booth_id IN (SELECT id FROM public.booths WHERE vendor_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "orders_vendor_update" ON public.orders;
CREATE POLICY "orders_vendor_update" ON public.orders
  FOR UPDATE
  USING (
    booth_id IN (SELECT id FROM public.booths WHERE vendor_id = (select auth.uid()))
  )
  WITH CHECK (
    booth_id IN (SELECT id FROM public.booths WHERE vendor_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select" ON public.orders
  FOR SELECT USING (public.is_admin((select auth.uid())));

-- ── feedback ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback;
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "feedback_vendor_read_own" ON public.feedback;
CREATE POLICY "feedback_vendor_read_own" ON public.feedback
  FOR SELECT USING (
    source = 'customer'
    AND booth_id IN (SELECT id FROM public.booths WHERE vendor_id = (select auth.uid()))
  );

-- ── licenses ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "licenses_vendor_select" ON public.licenses;
CREATE POLICY "licenses_vendor_select" ON public.licenses
  FOR SELECT USING (
    vendor_id = (select auth.uid()) OR public.is_admin((select auth.uid()))
  );

-- ── admins / admin_audit ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins_admin_select" ON public.admins;
CREATE POLICY "admins_admin_select" ON public.admins
  FOR SELECT USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "admin_audit_admin_select" ON public.admin_audit;
CREATE POLICY "admin_audit_admin_select" ON public.admin_audit
  FOR SELECT USING (public.is_admin((select auth.uid())));

-- ── payments ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    vendor_id = (select auth.uid()) OR public.is_admin((select auth.uid()))
  );

-- ── events ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_admin_select" ON public.events;
CREATE POLICY "events_admin_select" ON public.events
  FOR SELECT USING (public.is_admin((select auth.uid())));

-- ── purchase_requests ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchase_requests_vendor_insert" ON public.purchase_requests;
CREATE POLICY "purchase_requests_vendor_insert" ON public.purchase_requests
  FOR INSERT WITH CHECK (vendor_id = (select auth.uid()));

DROP POLICY IF EXISTS "purchase_requests_select" ON public.purchase_requests;
CREATE POLICY "purchase_requests_select" ON public.purchase_requests
  FOR SELECT USING (
    vendor_id = (select auth.uid()) OR public.is_admin((select auth.uid()))
  );

DROP POLICY IF EXISTS "purchase_requests_admin_update" ON public.purchase_requests;
CREATE POLICY "purchase_requests_admin_update" ON public.purchase_requests
  FOR UPDATE
  USING (public.is_admin((select auth.uid())))
  WITH CHECK (public.is_admin((select auth.uid())));
