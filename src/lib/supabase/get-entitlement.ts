import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { getEntitlement, type Entitlement } from "@/lib/plan";
import type { User } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/types";

/**
 * Resolve the current vendor's effective entitlement (plan + any live license).
 *
 * vendors.id === auth.users.id and licenses.vendor_id === vendors.id, so both
 * the vendor row and the license both key on user.id — they're fetched in
 * parallel (one round-trip, not two) on this hot dashboard path.
 *
 * Defensive: if the licenses table predates migration 0010 the query errors and
 * `data` is null, so we degrade to the plan-only entitlement rather than throw.
 */
export const loadEntitlement = cache(
  async (): Promise<{
    user: User | null;
    vendor: Vendor | null;
    entitlement: Entitlement;
    licenseExpiresAt: string | null;
  }> => {
    const supabase = await createServerClient();
    const user = await getUser();
    const now = Date.now();

    if (!user) {
      return {
        user: null,
        vendor: null,
        entitlement: getEntitlement("free", null, now),
        licenseExpiresAt: null,
      };
    }

    // A pass counts only inside its window: valid_from <= now < expires_at. Among
    // currently-active licenses, take the latest-expiring (longest remaining).
    const nowIso = new Date(now).toISOString();
    const [{ data: vendor }, { data: license }] = await Promise.all([
      supabase.from("vendors").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("licenses")
        .select("expires_at")
        .eq("vendor_id", user.id)
        .lte("valid_from", nowIso)
        .gt("expires_at", nowIso)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const licenseExpiresAt = vendor ? (license?.expires_at ?? null) : null;
    return {
      user,
      vendor: vendor ?? null,
      entitlement: getEntitlement(
        vendor?.plan ?? "free",
        licenseExpiresAt,
        now,
      ),
      licenseExpiresAt,
    };
  },
);

/**
 * Page guard variant of loadEntitlement: redirect when the gate fails
 * (`/login` if not signed in, `/onboarding` if not yet onboarded), otherwise
 * return the entitlement bundle with non-null user + vendor.
 */
export async function requireEntitledVendor(): Promise<{
  user: User;
  vendor: Vendor;
  entitlement: Entitlement;
  licenseExpiresAt: string | null;
}> {
  const { user, vendor, entitlement, licenseExpiresAt } =
    await loadEntitlement();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");
  return { user, vendor, entitlement, licenseExpiresAt };
}
