"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { generateLinkToken } from "@/lib/telegram";
import type { ActionResult } from "@/lib/action-result";

const LINK_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Mints a single-use, 30-minute Telegram account-linking token for the
 * caller and returns the t.me deep link (`t.me/<bot>?start=<token>`) for
 * the settings page to render as a QR code. qkit.telegram_link_tokens has
 * RLS enabled with zero client policies, so the insert goes through the
 * service-role client — the caller's identity is still derived from their
 * own session first, never trusted from the client.
 */
export async function generateTelegramLink(): Promise<
  ActionResult<{ deepLinkUrl: string }>
> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    console.error("generateTelegramLink: TELEGRAM_BOT_USERNAME is unset");
    return { success: false, error: "Telegram isn't set up yet" };
  }

  const token = generateLinkToken();
  const service = await createServiceClient();
  const { error } = await service.from("telegram_link_tokens").insert({
    token,
    vendor_id: user.id,
    expires_at: new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("generateTelegramLink: insert failed", error.message);
    return { success: false, error: "Could not generate a Telegram link" };
  }

  return {
    success: true,
    deepLinkUrl: `https://t.me/${botUsername}?start=${token}`,
  };
}

/**
 * Unlinks the caller's Telegram chat — deletes their qkit.vendor_telegram
 * row. That table grants `authenticated` SELECT only (no client write
 * grant, matching the webhook route's own write path), so the delete goes
 * through the service-role client, scoped to the caller's own vendor_id.
 */
export async function disconnectTelegram(): Promise<ActionResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const service = await createServiceClient();
  const { error } = await service
    .from("vendor_telegram")
    .delete()
    .eq("vendor_id", user.id);
  if (error) {
    console.error("disconnectTelegram failed", error.message);
    return { success: false, error: "Could not disconnect Telegram" };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}
