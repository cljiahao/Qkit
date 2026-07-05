-- Vendor → admin help requests. A vendor reports a problem (pass / payment / pro
-- / other) from their dashboard; the admin reads and resolves it in the admin
-- dashboard — no email. Mirrors purchase_requests: vendor-owned, admin-read, a
-- simple open→resolved lifecycle.

CREATE TABLE qkit.support_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('pass', 'payment', 'pro', 'other')),
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status      TEXT        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inbox reads: open messages, newest first.
CREATE INDEX support_messages_open_idx
  ON qkit.support_messages (status, created_at DESC);

ALTER TABLE qkit.support_messages ENABLE ROW LEVEL SECURITY;

-- A vendor files their own message and can see it (to know it landed).
CREATE POLICY "support_messages_vendor_insert" ON qkit.support_messages
  FOR INSERT WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "support_messages_select" ON qkit.support_messages
  FOR SELECT USING (vendor_id = auth.uid() OR qkit.is_admin(auth.uid()));

-- Admin resolves (the admin server action also uses the service role).
CREATE POLICY "support_messages_admin_update" ON qkit.support_messages
  FOR UPDATE USING (qkit.is_admin(auth.uid()));

-- Table-level privileges for the Data API's `authenticated` role — RLS filters
-- rows, but Postgres still requires the base grant (a vendor inserts/reads its
-- own; an admin reads all + updates). Service-role bypasses both.
GRANT SELECT, INSERT, UPDATE ON qkit.support_messages TO authenticated;
