-- Adds undo_seconds to vendors.board_settings: how long OrderCard's
-- advance-undo affordance (Mark Ready/Mark Picked Up) stays live before
-- finalizing, vendor-configurable instead of the hardcoded 4s default.
-- JSONB, not a real column, so existing rows need an explicit backfill —
-- a new key in a column DEFAULT only applies to future inserts.
ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings || '{"undo_seconds":4}'::jsonb
  WHERE NOT (board_settings ? 'undo_seconds');
