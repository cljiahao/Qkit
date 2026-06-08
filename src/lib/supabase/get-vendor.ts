import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/types";

/**
 * Single source of truth for the auth/onboarding gate.
 * Returns the current user and their vendor row (null if not signed in
 * or not yet onboarded).
 */
export async function getVendor(): Promise<{
  user: User | null;
  vendor: Vendor | null;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, vendor: null };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, vendor: vendor ?? null };
}
