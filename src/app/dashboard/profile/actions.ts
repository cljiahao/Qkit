"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "@/lib/merqo-vendor-profile";
import {
  profileNameSchema,
  socialLinksSchema,
  type ProfileNameInput,
  type SocialLinksInput,
} from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

/**
 * Update the vendor's stall name. Persisted in merqo.vendor_profile (shared
 * across kits, see docs/superpowers/specs/2026-07-16-shared-vendor-profile-design.md)
 * via the upsert_vendor_profile RPC — not a local qkit.vendors write.
 */
export async function updateStallName(
  input: ProfileNameInput,
): Promise<ActionResult> {
  const parsed = profileNameSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid stall name",
    };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      parsed.data.name,
      current.social_links,
    );
  } catch (err) {
    console.error(
      "updateStallName failed",
      err instanceof Error ? err.message : err,
    );
    return { success: false, error: "Could not save stall name" };
  }

  // Refresh the layout so the header + account menu pick up the new name.
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

/**
 * Update the vendor's profile-level default social/website links. Same
 * merqo.vendor_profile write path as updateStallName.
 */
export async function updateSocialLinks(
  input: SocialLinksInput,
): Promise<ActionResult> {
  const parsed = socialLinksSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid links",
    };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      current.stall_name,
      parsed.data,
    );
  } catch (err) {
    console.error(
      "updateSocialLinks failed",
      err instanceof Error ? err.message : err,
    );
    return { success: false, error: "Could not save links" };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
