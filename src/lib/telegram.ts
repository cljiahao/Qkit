import { randomUUID } from "node:crypto";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Fire-and-forget: sends a Telegram message to `chatId` via the Bot API's
 * `sendMessage`. Never throws — a missing bot token is a no-op (Telegram
 * alerts are optional infra, never a hard dependency for the caller, e.g.
 * `placeOrder`) and a fetch failure is caught and logged rather than
 * propagated. Callers that need the send outcome should not rely on this;
 * it deliberately has no success/failure return value.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("sendTelegramMessage failed", err);
  }
}

/**
 * A short-lived, single-use account-linking token for the Telegram deep
 * link (`t.me/<bot>?start=<token>`). Telegram's own deep-link payload
 * constraint (not a design choice): `[A-Za-z0-9_-]{1,64}`. A hex UUID
 * (32 chars, no dashes) comfortably satisfies both the charset and the
 * length cap while staying unguessable.
 */
export function generateLinkToken(): string {
  return randomUUID().replace(/-/g, "");
}
