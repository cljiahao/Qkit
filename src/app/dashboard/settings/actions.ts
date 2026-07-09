"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { boardSettingsSchema, type BoardSettingsInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

/**
 * Update the vendor's live-order-board preferences (vendors.board_settings).
 * The authenticated role is granted UPDATE on (name, tour_seen_at,
 * board_settings) under RLS vendors_self_update (migration 0050), so this runs
 * on the normal server client scoped to the caller's own row.
 */
export async function updateBoardSettings(
  input: BoardSettingsInput,
): Promise<ActionResult> {
  const parsed = boardSettingsSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings",
    };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const { error } = await supabase
    .from("vendors")
    .update({ board_settings: parsed.data })
    .eq("id", user.id);

  if (error) {
    console.error("updateBoardSettings failed", error.message);
    return { success: false, error: "Could not save settings" };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
