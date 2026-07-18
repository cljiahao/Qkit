-- Manual queue priority override: a vendor's explicit "help this one now"
-- action. NULL = normal FIFO. Non-null = this order sorts ahead of every
-- non-bumped order in the same status lane (src/lib/orders.ts's
-- sortActiveOrders), most-recently-bumped first among other bumped orders.
-- created_at is never touched by a bump, so ticket-aging display stays
-- accurate regardless of bump state. One-time (not a permanent pin) — the
-- app clears/ignores it once the order reaches a terminal status.
ALTER TABLE qkit.orders
  ADD COLUMN IF NOT EXISTS priority_bumped_at TIMESTAMPTZ;

-- orders: table-level GRANT UPDATE + RLS policy orders_vendor_update
-- (owner-scoped, same as status) already cover a new column — no grant/
-- policy change needed here, same reasoning as migration 0052's booths note.
