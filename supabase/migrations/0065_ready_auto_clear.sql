-- Ready-order auto-clear (Phase 1 job board PR-E1): a vendor-configurable
-- timeout after which a 'ready' order that was never manually marked picked
-- up auto-flips to 'completed', so a forgotten ticket doesn't clutter the
-- board indefinitely. Default 3 minutes (conservative — see the job board's
-- own reasoning against the originally-floated 15s), vendor-tunable in
-- /dashboard/settings; null disables the sweep entirely.
--
-- auto_completed distinguishes a sweep-driven completion from a vendor's own
-- manual "Mark Picked Up" tap — set true ONLY by sweepReadyOrders
-- (order-actions.ts), reset false by restoreAutoCompleted or a fresh manual
-- advance. Gates the "Restore to ready" affordance on the completed-orders
-- page, which must not appear on an order the vendor genuinely completed
-- themselves.
ALTER TABLE qkit.orders
  ADD COLUMN auto_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE qkit.vendors
  ALTER COLUMN board_settings SET DEFAULT
    '{"aging_min":5,"overdue_min":10,"sound_id":"chime","desktop_notify":false,"undo_seconds":4,"daily_order_number_reset":false,"default_prep_minutes":null,"ready_auto_clear_min":3}'::jsonb;

UPDATE qkit.vendors
  SET board_settings = board_settings
    || '{"ready_auto_clear_min":3}'::jsonb
  WHERE NOT (board_settings ? 'ready_auto_clear_min');
