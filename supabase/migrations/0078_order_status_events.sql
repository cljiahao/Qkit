-- Append-only history of qkit.orders.status transitions. `orders.status`
-- itself is a single column overwritten on every transition (advanceOrder /
-- cancelOrder / revertOrderAdvance / restoreAutoCompleted / sweepReadyOrders,
-- src/app/dashboard/order-actions.ts) — nothing today records WHAT it used to
-- be, WHO moved it, or WHEN, so a disputed order ("I marked it ready, why
-- does the vendor say it was still preparing?") has no trail to reconstruct
-- from. This table is purely additive: every write here happens alongside
-- the existing `orders.status` column update, never replacing it.
--
-- Same ownership/authorization shape as qkit.admin_audit (migration 0006):
-- RLS admin-read-only + the order's own vendor, service-role-write-only (no
-- insert/update/delete policy for authenticated/anon — the app only ever
-- inserts, via the service-role client, see src/lib/audit.ts).
CREATE TABLE qkit.order_status_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES qkit.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_status_events_order_id_idx
  ON qkit.order_status_events (order_id, created_at DESC);

ALTER TABLE qkit.order_status_events ENABLE ROW LEVEL SECURITY;

-- The order's own vendor (via its booth) may read its history — same
-- ownership subquery pattern as orders_vendor_select (0001/0039).
CREATE POLICY "order_status_events_vendor_select" ON qkit.order_status_events
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM qkit.orders o
      JOIN qkit.booths b ON b.id = o.booth_id
      WHERE b.vendor_id = (select auth.uid())
    )
  );

CREATE POLICY "order_status_events_admin_select" ON qkit.order_status_events
  FOR SELECT USING (qkit.is_admin((select auth.uid())));

-- Data-API grant: SELECT only for authenticated (RLS above scopes rows),
-- same shape as admin_audit's own grant (0041) — no INSERT/UPDATE/DELETE for
-- authenticated/anon; every write goes through the service-role client.
GRANT SELECT ON qkit.order_status_events TO authenticated;
GRANT ALL    ON qkit.order_status_events TO service_role;
