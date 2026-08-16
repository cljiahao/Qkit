-- Vendor Telegram alerts (Phase A of the Telegram integration design, see
-- docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md): a
-- vendor links their Telegram account once via a deep-link QR
-- (t.me/<bot>?start=<token>), then gets a message on every new order as a
-- redundant channel alongside the live dashboard board.

-- One linked chat per vendor. Writes go through the service-role client
-- only (the webhook route on link, the settings disconnect action on
-- unlink) — no INSERT/UPDATE/DELETE grant to authenticated, same
-- writer-restriction reasoning as the sibling paykit repo's
-- vendor_payment_config.
CREATE TABLE qkit.vendor_telegram (
  vendor_id  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id    BIGINT      NOT NULL,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qkit.vendor_telegram ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_telegram_own" ON qkit.vendor_telegram
  FOR SELECT USING (vendor_id = (SELECT auth.uid()));

GRANT SELECT ON qkit.vendor_telegram TO authenticated;

-- Short-lived, single-use deep-link tokens: the settings page's "Connect
-- Telegram" action mints one (30-minute expiry), the webhook route
-- resolves + deletes it on a matching `/start <token>`. RLS enabled, zero
-- policies — service-role only, same "no client reads this table at all"
-- shape as qkit.pricing's writer restriction (no client needs to read a
-- one-time linking token at all, not even its own).
CREATE TABLE qkit.telegram_link_tokens (
  token       TEXT        PRIMARY KEY,
  vendor_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qkit.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
