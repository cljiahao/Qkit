-- Multiple dashboard page tours (one per page, see @merqo/ui's DashboardTours)
-- each need their own "seen" state, not one shared boolean. tours_seen is a
-- map of tourId -> ISO timestamp, replacing the single-tour tour_seen_at
-- (migration 0023). Existing vendors who saw the original dashboard tour
-- (now tourId "orders") keep that credit so it doesn't replay for them.
ALTER TABLE qkit.vendors
  ADD COLUMN IF NOT EXISTS tours_seen JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE qkit.vendors
SET tours_seen = jsonb_build_object('orders', tour_seen_at)
WHERE tour_seen_at IS NOT NULL;

ALTER TABLE qkit.vendors
  DROP COLUMN tour_seen_at;

GRANT UPDATE (tours_seen) ON qkit.vendors TO authenticated;
