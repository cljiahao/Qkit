"use server";

import { createServerClient } from "@/lib/supabase/server";
import { supportMessageSchema, type SupportMessageInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

/**
 * File a help request for the admin to action in the dashboard (no email). The
 * vendor picks a category (pass/payment/pro/other) and writes what's wrong;
 * RLS scopes the insert to their own vendor_id.
 */
export async function submitSupportMessage(
  input: SupportMessageInput,
): Promise<ActionResult> {
  const parsed = supportMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid message",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  const { error } = await supabase.from("support_messages").insert({
    vendor_id: user.id,
    category: parsed.data.category,
    body: parsed.data.body,
  });
  if (error) {
    console.error("submitSupportMessage failed", error.message);
    return { success: false, error: "Could not send your message" };
  }
  return { success: true };
}
