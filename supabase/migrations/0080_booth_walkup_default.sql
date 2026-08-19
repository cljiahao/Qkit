-- Event-mode setup: a per-booth default that makes walk-up order entry
-- (qkit.place_walkup_order, migrations 0060-61) the board's primary/opening
-- action instead of the QR/menu-first presentation — for a one-off event
-- where staff key in every order at the counter and guests never scan a QR
-- themselves. Purely a UI hint read by realtime-order-board.tsx; it changes
-- neither place_order nor place_walkup_order's own behavior, and every
-- existing booth defaults to false (QR ordering unaffected).
ALTER TABLE qkit.booths
  ADD COLUMN walkup_default BOOLEAN NOT NULL DEFAULT false;
