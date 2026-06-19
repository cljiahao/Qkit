"use server";

import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { feedbackSchema, type FeedbackInput } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

/**
 * Submit in-product feedback (customer post-order or vendor). Public insert (RLS
 * allows anyone), validated, and rate-limited per IP to stop spam. Vendor source
 * stamps the signed-in vendor id; customer source stays anonymous.
 */
export async function submitFeedback(
  input: FeedbackInput,
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid feedback",
    };
  const d = parsed.data;

  const supabase = await createServerClient();

  // Throttle: 3 submissions / 5 min per IP.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `feedback:${ip}`,
    p_limit: 3,
    p_window_seconds: 300,
  });
  if (allowed === false)
    return { success: false, error: "Thanks — you've already sent feedback." };

  let vendorId: string | null = null;
  if (d.source === "vendor") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    vendorId = user?.id ?? null;
  }

  const { error } = await supabase.from("feedback").insert({
    source: d.source,
    vendor_id: vendorId,
    booth_id: d.boothId ?? null,
    order_number: d.orderNumber ?? null,
    rating: d.rating ?? null,
    message: d.message && d.message.length > 0 ? d.message : null,
  });
  if (error) {
    console.error("submitFeedback failed", error.message);
    return { success: false, error: "Could not send feedback" };
  }
  return { success: true };
}
