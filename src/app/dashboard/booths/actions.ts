"use server";

import { createServerClient } from "@/lib/supabase/server";
import { boothFormSchema, type BoothFormInput } from "@/lib/schemas";

type SaveBoothResult =
  | { success: true; boothId: string }
  | { success: false; error: string };

export async function saveBooth(
  input: BoothFormInput,
): Promise<SaveBoothResult> {
  const parsed = boothFormSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid booth details" };
  const data = parsed.data;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const row = {
    name: data.name,
    image_url: data.image_url,
    is_active: data.is_active,
    menu_items: data.menu_items,
  };

  if (data.boothId) {
    // RLS (booths_vendor_all) scopes the update to this vendor's own booths.
    const { data: updated, error } = await supabase
      .from("booths")
      .update(row)
      .eq("id", data.boothId)
      .select("id")
      .maybeSingle();
    if (error || !updated)
      return { success: false, error: "Could not save booth" };
    return { success: true, boothId: updated.id };
  }

  const { data: inserted, error } = await supabase
    .from("booths")
    .insert({ ...row, vendor_id: user.id })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("createBooth failed", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return {
      success: false,
      error: `Could not create booth [${error?.code}: ${error?.message}]`,
    };
  }
  return { success: true, boothId: inserted.id };
}
