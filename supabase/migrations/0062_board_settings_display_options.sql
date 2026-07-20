-- Two vendor-configurable display options for board_settings, both landing
-- together since they're the same "sensible default (off), single-page
-- override" shape:
--
-- daily_order_number_reset (bool, default false) — when on, the board and
-- the customer status page show each order's position among today's orders
-- (1, 2, 3…) instead of its permanent order_number. Display-only: the real
-- order_number (unique per booth, used in receipts/access tokens/reports)
-- is never touched — this column adds no new counter, just a vendor
-- preference read at display time (src/lib/orders.ts#displayOrderNumber).
--
-- default_prep_minutes (int, nullable, default null) — a vendor-set
-- fallback prep-time estimate (minutes) for the customer wait estimate,
-- used only when there isn't enough of today's order history yet to
-- compute one from real data (src/lib/stats.ts#estimateWaitSeconds). null
-- means no fallback is configured; the page shows a queue-position label
-- instead of a time, same as before this migration.
--
-- Same JSONB-blob pattern as 0059 (undo_seconds): bump the column DEFAULT
-- for future inserts, backfill the keys onto every existing row that lacks
-- them.
ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4,"daily_order_number_reset":false,"default_prep_minutes":null}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings
    || '{"daily_order_number_reset":false}'::jsonb
  WHERE NOT (board_settings ? 'daily_order_number_reset');

UPDATE qkit.vendors
  SET board_settings = board_settings
    || '{"default_prep_minutes":null}'::jsonb
  WHERE NOT (board_settings ? 'default_prep_minutes');
