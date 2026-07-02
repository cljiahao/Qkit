import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import type { User } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/types";

/**
 * Single source of truth for the auth/onboarding gate.
 * Returns the current user and their vendor row (null if not signed in
 * or not yet onboarded). Memoized per request (React.cache) so a layout + its
 * page don't each re-run the auth + vendor round-trips.
 */
export const getVendor = cache(
  async (): Promise<{
    user: User | null;
    vendor: Vendor | null;
  }> => {
    const user = await getUser();
    if (!user) return { user: null, vendor: null };

    const supabase = await createServerClient();
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // A read ERROR is not the same as "no vendor row yet" (not onboarded):
    // maybeSingle returns null data + null error when the row is simply absent.
    // Returning null on an error would misroute a real vendor to /onboarding on
    // a transient DB hiccup, so surface it instead (caught by the error boundary).
    if (error) {
      console.error("getVendor: vendor read failed", error.message);
      throw new Error("vendor lookup failed");
    }

    return { user, vendor: vendor ?? null };
  },
);

/**
 * Page/layout guard: load the vendor and redirect when the gate fails —
 * `/login` if not signed in, `/onboarding` if signed in but not yet onboarded.
 * Returns non-null user + vendor so callers skip the repeated guard.
 */
export async function requireVendor(): Promise<{
  user: User;
  vendor: Vendor;
}> {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");
  return { user, vendor };
}
