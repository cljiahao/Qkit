-- In-product feedback from customers (post-order) and vendors, surfaced to the
-- admin. Lightweight: a single table, anyone may submit (like events/orders),
-- only admins read. The app requires at least a rating or a message.

CREATE TABLE qkit.feedback (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT        NOT NULL CHECK (source IN ('customer', 'vendor')),
  vendor_id    UUID        REFERENCES qkit.vendors(id) ON DELETE SET NULL,
  booth_id     UUID        REFERENCES qkit.booths(id) ON DELETE SET NULL,
  order_number TEXT,
  rating       INT         CHECK (rating BETWEEN 1 AND 5),
  message      TEXT        CHECK (message IS NULL OR char_length(message) <= 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feedback_created_idx ON qkit.feedback (created_at DESC);
CREATE INDEX feedback_source_idx ON qkit.feedback (source, created_at DESC);

ALTER TABLE qkit.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone may submit (customers are anonymous); only admins read.
CREATE POLICY "feedback_public_insert" ON qkit.feedback
  FOR INSERT WITH CHECK (true);

CREATE POLICY "feedback_admin_select" ON qkit.feedback
  FOR SELECT USING (qkit.is_admin(auth.uid()));
