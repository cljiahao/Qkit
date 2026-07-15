-- Feedback has two distinct audiences that were blurred together:
--   • customer → vendor (order experience)  — a 1–5★ rating
--   • vendor   → qkit   (product loyalty)    — now an NPS 0–10 score
-- Add an `nps` column for the vendor path (rating stays for customers), and let
-- a vendor READ the customer feedback about their own booths (their reputation).

ALTER TABLE qkit.feedback
  ADD COLUMN IF NOT EXISTS nps SMALLINT CHECK (nps BETWEEN 0 AND 10);

-- Vendors may read customer feedback tied to their own booths. Customers still
-- write anonymously (public insert); vendors read only their booths' rows, never
-- another vendor's. Admin SELECT (feedback_admin_select) is unchanged.
CREATE POLICY "feedback_vendor_read_own" ON qkit.feedback
  FOR SELECT USING (
    source = 'customer'
    AND booth_id IN (
      SELECT id FROM qkit.booths WHERE vendor_id = auth.uid()
    )
  );
