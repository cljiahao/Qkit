-- Index feedback by booth for the vendor-stats reviews query.
--
-- The stats page reads a vendor's customer reviews with
--   .eq('source','customer').order('created_at' desc).limit(500)
-- and leaned entirely on RLS (feedback_vendor_read_own) to scope the rows to
-- booths the vendor owns. With only feedback(created_at) and
-- feedback(source, created_at) indexes, Postgres walked the whole customer-
-- feedback set applying the per-row booth-membership filter, so stats latency
-- grew with platform-wide feedback rather than the vendor's own. The query now
-- also filters .in('booth_id', ...); index that shape.
CREATE INDEX IF NOT EXISTS feedback_booth_created_idx
  ON qkit.feedback (booth_id, created_at DESC);
