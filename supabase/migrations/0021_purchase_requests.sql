-- "Get a pass" / "Go monthly" used to open a mailto: to a personal inbox. Replace
-- that with an in-product request the admin actions: a vendor files a pending
-- request, the admin sees it on the dashboard and grants the pass/Pro (which
-- resolves the request).

CREATE TABLE qkit.purchase_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL CHECK (kind IN ('event', 'monthly')),
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX purchase_requests_pending_idx
  ON qkit.purchase_requests (status, created_at DESC);

ALTER TABLE qkit.purchase_requests ENABLE ROW LEVEL SECURITY;

-- A vendor files their own request and can see it (to know it's pending).
CREATE POLICY "purchase_requests_vendor_insert" ON qkit.purchase_requests
  FOR INSERT WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "purchase_requests_select" ON qkit.purchase_requests
  FOR SELECT USING (vendor_id = auth.uid() OR qkit.is_admin(auth.uid()));

-- Admin resolves (the admin server action also uses the service role).
CREATE POLICY "purchase_requests_admin_update" ON qkit.purchase_requests
  FOR UPDATE USING (qkit.is_admin(auth.uid()));
