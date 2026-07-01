-- Order integrity (B2): harden the VENDOR write path in Postgres, mirroring the
-- customer-path hardening (Phase A). Two gaps closed:
--   1. orders_vendor_update had USING but NO WITH CHECK → a vendor UPDATE could
--      re-point booth_id to a booth they don't own (ownership theft). USING only
--      filters which rows are visible to update; WITH CHECK constrains the result.
--   2. No column freeze → a tampered vendor session or a direct PostgREST call
--      with the vendor JWT (skips our server actions) could set ANY column:
--      total_cents, items (per-line price_cents/cost_cents), order_number, etc.
-- RLS WITH CHECK can only see the NEW row, not OLD, so it cannot express
-- "total_cents must equal its prior value" — that's why the freeze is a trigger.

-- ── 1. WITH CHECK on the vendor UPDATE policy ────────────────────────────────
-- Pre-launch (no vendors) → drop + recreate is a clean cutover. Both clauses use
-- bare auth.uid() to match the sibling orders_vendor_select; the systematic
-- (select auth.uid()) optimization (L8) is a separate sweep.
DROP POLICY IF EXISTS "orders_vendor_update" ON public.orders;
CREATE POLICY "orders_vendor_update" ON public.orders
  FOR UPDATE
  USING (
    booth_id IN (SELECT id FROM public.booths WHERE vendor_id = auth.uid())
  )
  WITH CHECK (
    booth_id IN (SELECT id FROM public.booths WHERE vendor_id = auth.uid())
  );

-- ── 2. Freeze financial/identity columns on UPDATE ───────────────────────────
-- These are set once by place_order (INSERT) and must never change afterward.
-- A vendor UPDATE may only move the state machine: status, payment_status,
-- paid_at, ready_at, completed_at (+ updated_at, stamped by orders_updated_at).
-- SECURITY INVOKER (default): reads only NEW/OLD, no table access. Fires on
-- every UPDATE incl. service-role — nothing legitimately mutates these columns.
CREATE OR REPLACE FUNCTION public.orders_freeze_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.booth_id            IS DISTINCT FROM OLD.booth_id
    OR NEW.order_number      IS DISTINCT FROM OLD.order_number
    OR NEW.customer_name     IS DISTINCT FROM OLD.customer_name
    OR NEW.items             IS DISTINCT FROM OLD.items
    OR NEW.total_cents       IS DISTINCT FROM OLD.total_cents
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    OR NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key
    OR NEW.payment_method_kind IS DISTINCT FROM OLD.payment_method_kind
  THEN
    RAISE EXCEPTION 'ORDER_IMMUTABLE_COLUMN: financial/identity columns cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_freeze_columns ON public.orders;
CREATE TRIGGER orders_freeze_columns
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_freeze_columns();
