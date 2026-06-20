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
  // When flipping to pro against a real (non-comp) payment, record it.
  amountCents: z.number().int().nonnegative().max(10_000_00).optional(),
  note: z.string().max(200).optional(),
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

  // Record subscription revenue when flipping to pro against a real payment
  // (blank/0 = a comp, no ledger row). Best-effort.
  const amount = parsed.data.amountCents ?? 0;
  if (parsed.data.plan === "pro" && amount > 0) {
    const { error: payError } = await supabase.from("payments").insert({
      vendor_id: parsed.data.vendorId,
      kind: "subscription",
      amount_cents: amount,
      source: "paynow",
      note: parsed.data.note ?? null,
    });
    if (payError) console.error("payment insert failed", payError.message);
  }

  // Audit trail of who changed what. Best-effort — don't fail the action if the
  // audit insert hiccups, but log it so a broken trail is visible.
  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "set_plan",
    target_id: parsed.data.vendorId,
    detail: { to: parsed.data.plan, amount_cents: amount },
  });
  if (auditError)
    console.error("admin_audit insert failed", auditError.message);

  // Upgrading clears any pending request the vendor filed (best-effort).
  if (parsed.data.plan === "pro")
    await resolveVendorRequests(supabase, parsed.data.vendorId);

  revalidatePath("/admin");
  return { success: true };
}

// Mark a vendor's pending upgrade requests resolved — called when an admin
// fulfils them by granting a pass / Pro. Best-effort, never blocks the action.
async function resolveVendorRequests(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
): Promise<void> {
  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("vendor_id", vendorId)
    .eq("status", "pending");
  if (error) console.error("resolveVendorRequests failed", error.message);
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

  // The pass is a window: starts at validFrom (or now) and runs `days`.
  const MS_PER_DAY = 86_400_000;
  const validFrom = parsed.data.validFromIso ?? new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(validFrom) + parsed.data.days * MS_PER_DAY,
  ).toISOString();

  const supabase = await createServiceClient();
  const { data: license, error } = await supabase
    .from("licenses")
    .insert({
      vendor_id: parsed.data.vendorId,
      valid_from: validFrom,
      expires_at: expiresAt,
      source: "admin_manual",
      note: parsed.data.note ?? null,
    })
    .select("id")
    .single();
  if (error || !license) {
    console.error("grantPass failed", error?.message ?? "no row");
    return { success: false, error: "Could not grant pass" };
  }

  // Record the money separately in the revenue ledger (0 = free comp → no row).
  const amount = parsed.data.amountCents ?? 0;
  if (amount > 0) {
    const { error: payError } = await supabase.from("payments").insert({
      vendor_id: parsed.data.vendorId,
      kind: "pass",
      amount_cents: amount,
      source: "paynow",
      note: parsed.data.note ?? null,
      license_id: license.id,
    });
    if (payError) console.error("payment insert failed", payError.message);
  }

  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "grant_pass",
    target_id: parsed.data.vendorId,
    detail: {
      days: parsed.data.days,
      valid_from: validFrom,
      note: parsed.data.note ?? null,
      amount_cents: parsed.data.amountCents ?? 0,
    },
  });
  if (auditError)
    console.error("admin_audit insert failed", auditError.message);

  await resolveVendorRequests(supabase, parsed.data.vendorId);

  revalidatePath("/admin");
  return { success: true };
}

const resolveRequestSchema = z.object({ id: z.string().uuid() });

/** Dismiss a vendor's upgrade request once handled. Admin-only. */
export async function resolvePurchaseRequest(
  input: z.infer<typeof resolveRequestSchema>,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = resolveRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("resolvePurchaseRequest failed", error.message);
    return { success: false, error: "Could not resolve" };
  }

  revalidatePath("/admin");
  return { success: true };
}

const revokePassSchema = z.object({ vendorId: z.string().uuid() });

/**
 * Revoke a vendor's live pass(es): end the window now (set expires_at = now)
 * rather than delete, so the record + its payment + audit trail survive. Revoke
 * removes access only — it is not a refund. Admin-only, service-role.
 */
export async function revokePass(
  input: z.infer<typeof revokePassSchema>,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = revokePassSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const nowIso = new Date().toISOString();
  const supabase = await createServiceClient();
  const { data: ended, error } = await supabase
    .from("licenses")
    .update({ expires_at: nowIso })
    .eq("vendor_id", parsed.data.vendorId)
    .gt("expires_at", nowIso)
    .select("id");
  if (error) {
    console.error("revokePass failed", error.message);
    return { success: false, error: "Could not revoke pass" };
  }

  const { error: auditError } = await supabase.from("admin_audit").insert({
    admin_id: user.id,
    action: "revoke_pass",
    target_id: parsed.data.vendorId,
    detail: { ended: ended?.length ?? 0 },
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
