-- ── Analytics events ─────────────────────────────────────────────────────────

CREATE TABLE qkit.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        REFERENCES qkit.vendors(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX events_type_created_idx ON qkit.events (type, created_at);

ALTER TABLE qkit.events ENABLE ROW LEVEL SECURITY;

-- Anyone may log an event (like order inserts); no public read.
CREATE POLICY "events_public_insert" ON qkit.events
  FOR INSERT WITH CHECK (true);

-- Only admins may read events. Relies on qkit.is_admin() from 0004.
CREATE POLICY "events_admin_select" ON qkit.events
  FOR SELECT USING (qkit.is_admin(auth.uid()));
