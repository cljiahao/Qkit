-- qkit.sweep_stale_orders (0097) runs every five minutes and, with only
-- orders_booth_created_idx (booth_id, created_at) to work from, reads the whole
-- orders table each time to find a handful of rows. That cost grows with every
-- order ever placed, on a job that runs 288 times a day.
--
-- These two partial indexes hold only the rows each half of the sweep looks
-- for: orders still waiting at the payment step, and orders sitting in ready.
-- Both sets are small and stay small however long the history gets, since an
-- order leaves the index the moment it is paid, cancelled or collected. The
-- sweep's cost then follows the orders in flight, not the vendors, booths or
-- past orders on the platform.
CREATE INDEX IF NOT EXISTS orders_unpaid_pending_created_idx
  ON qkit.orders (created_at)
  WHERE status = 'pending' AND payment_status = 'pending' AND source = 'qr';

CREATE INDEX IF NOT EXISTS orders_ready_at_idx
  ON qkit.orders (ready_at)
  WHERE status = 'ready';
