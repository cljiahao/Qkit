"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  profileNameSchema,
  socialLinksSchema,
  type ProfileNameInput,
  type SocialLinksInput,
} from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

/**
 * Update the vendor's stall name (vendors.name). The authenticated role is
 * granted UPDATE on (name, tour_seen_at) under RLS vendors_self_update, so this
 * runs on the normal server client scoped to the caller's own row (id =
 * auth.uid()). Display name and password live on the auth user and are set
 * client-side via supabase.auth.updateUser — they don't pass through here.
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

  const { error } = await supabase
    .from("vendors")
    .update({ name: parsed.data.name })
    .eq("id", user.id);

  if (error) {
    console.error("updateStallName failed", error.message);
    return { success: false, error: "Could not save stall name" };
  }

  // Refresh the layout so the header + account menu pick up the new name.
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

/**
 * Update the vendor's profile-level default social/website links
 * (vendors.social_links). Same RLS/grant path as updateStallName — the
 * authenticated role can update its own vendors row (migration 0052 grants
 * UPDATE (social_links) explicitly).
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

  const { error } = await supabase
    .from("vendors")
    .update({ social_links: parsed.data })
    .eq("id", user.id);

  if (error) {
    console.error("updateSocialLinks failed", error.message);
    return { success: false, error: "Could not save links" };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
