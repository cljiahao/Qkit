"use server";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Mark the dashboard onboarding tour as seen for the current vendor, so it
 * stops auto-running on first login. Best-effort: this is cosmetic, so a
 * failure is logged but never surfaced — the worst case is the tour shows once
 * more. RLS scopes the update to the vendor's own row (id = auth.uid()).
 */
export async function markTourSeen(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("vendors")
    .update({ tour_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) console.error("markTourSeen failed", error.message);
}
