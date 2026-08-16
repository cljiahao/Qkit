-- Retires Phase A of the Telegram integration design (migration 0076):
-- qkit's own per-kit Telegram bot for vendor order alerts is superseded by
-- merqo's shared bot (Phase A2) — qkit now calls merqo's
-- POST /api/merqo/notify-vendor instead of running its own bot/webhook. See
-- docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md.
--
-- No data migration: a vendor's chat_id here is scoped to qkit's own
-- (now-dead) bot and is meaningless under merqo's bot (Telegram scopes
-- chat_id per bot×user pair) — every vendor who'd linked qkit's own bot
-- must reconnect once via merqo's profile page.

drop table qkit.telegram_link_tokens;
drop table qkit.vendor_telegram;
