"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

// Allowlist of trackable events. Reject anything else so the table can't be
// stuffed with arbitrary types from the client.
const eventTypeSchema = z.enum(["landing_cta", "upgrade_cta"]);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * Best-effort analytics. Fire-and-forget: validates the type, inserts via the
 * normal client (RLS allows insert), and never throws to the caller — analytics
 * must not disrupt the user flow, and it's a no-op until migration 0005 lands.
 */
export async function logEvent(type: EventType): Promise<void> {
  const parsed = eventTypeSchema.safeParse(type);
  if (!parsed.success) return;
  try {
    const supabase = await createServerClient();
    await supabase.from("events").insert({ type: parsed.data });
  } catch {
    // swallow — table may not exist yet, or insert may fail; analytics is
    // non-critical.
  }
}
