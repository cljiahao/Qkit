"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import {
  grantPassSchema,
  pricingFormSchema,
  type GrantPassInput,
  type PricingFormInput,
} from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

const setPlanSchema = z.object({
  vendorId: z.string().uuid(),
  plan: z.enum(["free", "pro"]),
});

/**
 * Flip a vendor's plan. Admin-only: requireAdmin() 404s non-admins before any
 * write. Uses the service-role client (allowed in Server Actions) because RLS
 * scopes vendor UPDATE to self — an admin edits other vendors' rows.
 */
export async function setVendorPlan(
  input: z.infer<typeof setPlanSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = setPlanSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { data: updated, error } = await supabase
    .from("vendors")
    .update({ plan: parsed.data.plan })
    .eq("id", parsed.data.vendorId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("setVendorPlan failed", error?.message ?? "no row updated");
    return { success: false, error: "Could not update plan" };
  }

  // Audit trail of who changed what. Best-effort — don't fail the action if the
  // audit insert hiccups, but log it so a broken trail is visible.
  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "set_plan",
    target_id: parsed.data.vendorId,
    detail: { to: parsed.data.plan },
  });
  if (auditError)
    console.error("admin_audit insert failed", auditError.message);

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Mint a time-boxed Pro pass for a vendor (manual fulfilment of a PayNow/cash
 * payment — Stripe is deferred until ACRA/UEN). Service-role insert; RLS blocks
 * client writes to licenses. Admin-only.
 */
export async function grantPass(input: GrantPassInput): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = grantPassSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const expiresAt = new Date(
    Date.now() + parsed.data.durationHours * 3_600_000,
  ).toISOString();

  const supabase = await createServiceClient();
  const { error } = await supabase.from("licenses").insert({
    vendor_id: parsed.data.vendorId,
    expires_at: expiresAt,
    source: "admin_manual",
    note: parsed.data.note ?? null,
  });
  if (error) {
    console.error("grantPass failed", error.message);
    return { success: false, error: "Could not grant pass" };
  }

  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "grant_pass",
    target_id: parsed.data.vendorId,
    detail: {
      hours: parsed.data.durationHours,
      note: parsed.data.note ?? null,
    },
  });
  if (auditError)
    console.error("admin_audit insert failed", auditError.message);

  revalidatePath("/admin");
  return { success: true };
}

/** Update the single pricing row shown on the offer page. Admin-only. */
export async function setPricing(
  input: PricingFormInput,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = pricingFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const updated_at = new Date().toISOString();

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pricing")
    .update({
      event_pass_cents: parsed.data.event_pass_cents,
      monthly_cents: parsed.data.monthly_cents,
      updated_at,
    })
    .eq("id", 1);
  if (error) {
    console.error("setPricing failed", error.message);
    return { success: false, error: "Could not update pricing" };
  }

  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "set_pricing",
    detail: {
      event_pass_cents: parsed.data.event_pass_cents,
      monthly_cents: parsed.data.monthly_cents,
    },
  });
  if (auditError)
    console.error("admin_audit insert failed", auditError.message);

  revalidatePath("/admin");
  revalidatePath("/dashboard/plan");
  return { success: true };
}
