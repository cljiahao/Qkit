-- Vendor-configurable live-order-board preferences: aging/overdue thresholds
-- (minutes), new-order sound choice, desktop notification opt-in. Stored
-- server-side (not localStorage) so it's user-scoped and consistent across
-- devices/browsers, same rationale as tour_seen_at (migration 0023). RLS
-- already lets a vendor update its own row, so no policy change is needed.
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS board_settings JSONB NOT NULL DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false}'::jsonb;

-- vendors.plan is deliberately NOT in the authenticated column grant (see
-- migration 0042) so a vendor can't self-escalate. board_settings carries no
-- such risk — add it to the vendor-editable column set.
GRANT UPDATE (board_settings) ON qkit.vendors TO authenticated;
