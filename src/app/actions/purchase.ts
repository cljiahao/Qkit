"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const optionSchema = z.enum(["event", "monthly"]);

/**
 * File an in-product upgrade request (pass or monthly Pro) for the admin to
 * action — replaces the old mailto:. Idempotent: a second click while a request
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
