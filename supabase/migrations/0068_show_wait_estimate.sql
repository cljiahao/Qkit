-- Vendor-configurable toggle: whether the customer status page's numeric
-- wait estimate (~4 min) shows at all. Off leaves the queue-position label
-- ("2 orders ahead of you") as the only wait info shown — the queue-position
-- line itself is unaffected, this only gates the minute guess layered on
-- top of it (see getWaitEstimate in
-- src/app/order/[boothId]/[orderNumber]/status-actions.ts). Default true —
-- the estimate is useful information most vendors want shown; this is an
-- opt-OUT, not opt-in, unlike daily_order_number_reset's original (0062)
-- off-by-default shape.
--
-- Same JSONB-blob pattern as 0059/0062: bump the column DEFAULT for future
-- inserts, backfill the key onto every existing row that lacks it (a
-- brand-new key — every vendor starts at the same true default, no existing
-- explicit value to preserve, so this uses the normal missing-key backfill
-- guard rather than 0067's unconditional overwrite).
ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4,"daily_order_number_reset":true,"show_wait_estimate":true,"default_prep_minutes":null,"ready_auto_clear_min":3}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings || '{"show_wait_estimate":true}'::jsonb
  WHERE NOT (board_settings ? 'show_wait_estimate');
