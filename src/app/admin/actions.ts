"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

const setPlanSchema = z.object({
  vendorId: z.string().uuid(),
  plan: z.enum(["free", "pro"]),
});

type Result = { success: true } | { success: false; error: string };

/**
 * Flip a vendor's plan. Admin-only: requireAdmin() 404s non-admins before any
 * write. Uses the service-role client (allowed in Server Actions) because RLS
 * scopes vendor UPDATE to self — an admin edits other vendors' rows.
 */
export async function setVendorPlan(
  input: z.infer<typeof setPlanSchema>,
): Promise<Result> {
  const { user } = await requireAdmin();

  const parsed = setPlanSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("vendors")
    .update({ plan: parsed.data.plan })
    .eq("id", parsed.data.vendorId);

  if (error) {
    console.error("setVendorPlan failed", error.message);
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
