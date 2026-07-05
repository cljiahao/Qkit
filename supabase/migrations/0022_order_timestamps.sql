-- Service-speed stats need to know WHEN an order became ready / was picked up,
-- not just its current status. created_at + updated_at can't recover this
-- (updated_at is overwritten on every change). Capture transition timestamps
-- going forward; past orders stay null and are excluded from wait metrics.
-- preparing_at is omitted: placeOrder inserts orders already in 'preparing',
-- so it would equal created_at.
ALTER TABLE qkit.orders
  ADD COLUMN IF NOT EXISTS ready_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
