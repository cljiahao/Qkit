-- Flips daily_order_number_reset's default from off to on, vendor-wide,
-- including for every existing vendor row (not just future inserts).
--
-- qkit's whole use case is pop-up/event booths, where a small daily-reset
-- ticket number (#3, not #847) is the norm customers already expect at a
-- physical counter — off-by-default was the cautious initial choice
-- (0062), but the product call is that on-by-default fits qkit's actual
-- customers better. Purely display: the real, permanent order_number
-- (unique per booth, used in receipts/access tokens/reports) is never
-- touched by this column either way — see
-- src/lib/orders.ts#displayOrderNumber.
--
-- Deliberately unconditional (not the "only backfill rows missing the
-- key" pattern 0059/0062 used for adding a brand-new key): every vendor
-- row already has an explicit daily_order_number_reset key by now, so a
-- WHERE NOT (... ? 'key') guard would backfill nothing. This is a genuine
-- default-value change applied to all rows, including a vendor who
-- explicitly turned it off — accepted as the intended blast radius, not
-- an oversight.
ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4,"daily_order_number_reset":true,"default_prep_minutes":null,"ready_auto_clear_min":3}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings || '{"daily_order_number_reset":true}'::jsonb;
