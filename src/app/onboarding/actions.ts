"use server";

import { createServerClient } from "@/lib/supabase/server";
import { vendorSchema, type VendorInput } from "@/lib/schemas";

type CreateVendorResult = { success: true } | { success: false; error: string };

export async function createVendor(
  input: VendorInput,
): Promise<CreateVendorResult> {
  const parsed = vendorSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid stall name" };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("vendors")
    .insert({ id: user.id, name: parsed.data.name });

  // 23505 = unique violation: the row already exists, treat as success.
  if (error && error.code !== "23505")
    return { success: false, error: "Could not create vendor" };

  return { success: true };
}
