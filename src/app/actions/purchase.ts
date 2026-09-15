"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";

const optionSchema = z.enum(["event", "monthly"]);

/**
 * File an in-product upgrade request (pass or monthly Pro) for the admin to
 * action. Idempotent: a second click while a request
 * of the same kind is still pending is a no-op success.
 */
export async function requestUpgrade(
  option: "event" | "monthly",
): Promise<ActionResult> {
  const parsed = optionSchema.safeParse(option);
  if (!parsed.success) return { success: false, error: "Invalid option" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  // The idempotency check below only blocks a repeat of the SAME kind while
  // pending -- an authenticated vendor could still script alternating
  // event/monthly calls to flood the admin queue without this.
  const allowed = await rateLimit(
    supabase,
    `upgrade-request:${user.id}`,
    5,
    60,
  );
  if (!allowed)
    return { success: false, error: "Too many requests. Wait a moment." };

  const { data: existing } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("vendor_id", user.id)
    .eq("kind", parsed.data)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existing) return { success: true };

  const { error } = await supabase
    .from("purchase_requests")
    .insert({ vendor_id: user.id, kind: parsed.data });
  if (error) {
    console.error("requestUpgrade failed", error.message);
    return { success: false, error: "Could not send your request" };
  }
  return { success: true };
}
