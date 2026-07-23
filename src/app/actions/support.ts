"use server";

import { createServerClient } from "@/lib/supabase/server";
import { supportMessageSchema, type SupportMessageInput } from "@/lib/schemas";
import { submitSupportMessage as submitSupportMessageRpc } from "@/lib/merqo-support";
import type { ActionResult } from "@/lib/action-result";

/**
 * File a help request into the shared cross-kit merqo.support_messages
 * inbox via merqo.submit_support_message, keyed to the signed-in vendor;
 * the SECURITY DEFINER RPC is the authorization boundary (it writes
 * auth.uid() itself, never a passed-in value).
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

  try {
    await submitSupportMessageRpc(
      supabase,
      parsed.data.category,
      parsed.data.body,
    );
  } catch (err) {
    console.error(
      "submitSupportMessage failed",
      err instanceof Error ? err.message : err,
    );
    return { success: false, error: "Could not send your message" };
  }
  return { success: true };
}
