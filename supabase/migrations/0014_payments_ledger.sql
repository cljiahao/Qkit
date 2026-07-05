-- Append-only revenue ledger: one immutable row per charge QKit collects. This
-- is the single source of truth for "what QKit made" — passes and (future)
-- monthly subscriptions, manual PayNow/cash now, Stripe later. Separate from
-- `licenses` (which is access/entitlement); payments is money.

CREATE TABLE qkit.payments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL CHECK (kind IN ('pass', 'subscription')),
  amount_cents INT        NOT NULL CHECK (amount_cents >= 0),
  source      TEXT        NOT NULL DEFAULT 'paynow'
                          CHECK (source IN ('paynow', 'cash', 'stripe')),
  note        TEXT,
  -- The pass this payment fulfilled, when applicable (subscriptions have none).
  license_id  UUID        REFERENCES qkit.licenses(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payments_vendor_created_idx ON qkit.payments (vendor_id, created_at);
CREATE INDEX payments_created_idx ON qkit.payments (created_at);

ALTER TABLE qkit.payments ENABLE ROW LEVEL SECURITY;

-- Vendor sees their own receipts; admins see all. Writes go through the
-- service-role admin actions only (no insert/update/delete policy).
CREATE POLICY "payments_select" ON qkit.payments
  FOR SELECT USING (vendor_id = auth.uid() OR qkit.is_admin(auth.uid()));

-- Consolidate the earlier amount-on-license stopgap (0012) into the ledger, then
-- retire that column so revenue lives in exactly one place.
INSERT INTO qkit.payments (vendor_id, kind, amount_cents, source, license_id, created_at)
  SELECT vendor_id, 'pass', amount_cents, 'paynow', id, created_at
  FROM qkit.licenses
  WHERE amount_cents > 0;

ALTER TABLE qkit.licenses DROP COLUMN IF EXISTS amount_cents;
