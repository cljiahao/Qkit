import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const revalidate = 0;

const START_PREFIX = "/start ";

/**
 * Constant-time check of Telegram's `X-Telegram-Bot-Api-Secret-Token`
 * header against `TELEGRAM_WEBHOOK_SECRET` (configured on this bot's
 * `setWebhook` call — see AGENTS.md's deploy notes). Mandatory, not
 * optional: without it, anyone who discovers this URL could POST fake
 * Updates and link arbitrary chats to a vendor's account. Fails closed
 * when the secret isn't configured at all.
 */
function secretOk(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const provided = Buffer.from(header);
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

// Only the shape this route actually reads out of a Telegram Update —
// everything else Telegram sends (edited_message, callback_query, etc.) is
// simply ignored, not validated.
const updateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({ id: z.number() }),
    })
    .optional(),
});

/**
 * Resolves a `/start <token>` deep link: looks up the token (service-role —
 * qkit.telegram_link_tokens has no client-read policy at all), rejects
 * silently if missing/expired, otherwise links the chat and burns the
 * token. Any failure here is caught by the caller and logged, never
 * surfaced to Telegram as a non-200.
 */
async function handleStart(token: string, chatId: number): Promise<void> {
  const supabase = await createServiceClient();

  const { data: linkToken } = await supabase
    .from("telegram_link_tokens")
    .select("vendor_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!linkToken) return;
  if (new Date(linkToken.expires_at).getTime() < Date.now()) return;

  const { error: upsertError } = await supabase
    .from("vendor_telegram")
    .upsert({ vendor_id: linkToken.vendor_id, chat_id: chatId });
  if (upsertError) {
    console.error(
      "telegram webhook: vendor_telegram upsert failed",
      upsertError.message,
    );
    return;
  }

  // Single-use — burn the token whether or not the confirmation send below
  // succeeds (the account is already linked at this point).
  await supabase.from("telegram_link_tokens").delete().eq("token", token);
  await sendTelegramMessage(
    chatId,
    "You're connected! New orders will be sent here.",
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!secretOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    // Not a real Telegram payload — nothing to do, but still ack so nothing
    // upstream retries a body that will never parse.
    return NextResponse.json({ ok: true });
  }

  const parsed = updateSchema.safeParse(json);
  const message = parsed.success ? parsed.data.message : undefined;

  if (message?.text?.startsWith(START_PREFIX)) {
    const token = message.text.slice(START_PREFIX.length).trim();
    try {
      if (token) await handleStart(token, message.chat.id);
    } catch (err) {
      // Internal failure resolving/linking — log it, but Telegram retries
      // aggressively on any non-2xx, so this must never surface as one.
      console.error("telegram webhook: /start handling failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
