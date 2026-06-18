import { createServerClient } from "@/lib/supabase/server";
import { getVendor } from "@/lib/supabase/get-vendor";
import { getEntitlement, type Entitlement } from "@/lib/plan";
import type { User } from "@supabase/supabase-js";
import type { Vendor } from "@/lib/types";

/**
 * Resolve the current vendor's effective entitlement (plan + any live license).
 * Defensive: if the licenses table predates migration 0010 the query errors and
 * `data` is null, so we degrade to the plan-only entitlement rather than throw.
 */
export async function loadEntitlement(): Promise<{
  user: User | null;
  vendor: Vendor | null;
  entitlement: Entitlement;
  licenseExpiresAt: string | null;
}> {
  const { user, vendor } = await getVendor();
  const now = Date.now();

  if (!user || !vendor) {
    return {
      user,
      vendor,
      entitlement: getEntitlement("free", null, now),
      licenseExpiresAt: null,
    };
  }

  // Take the latest-EXPIRING license (DESC on expires_at), not the most-recently
  // minted — overlapping passes should grant the longest window.
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("licenses")
    .select("expires_at")
    .eq("vendor_id", vendor.id)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const licenseExpiresAt = data?.expires_at ?? null;
  return {
    user,
    vendor,
    entitlement: getEntitlement(vendor.plan, licenseExpiresAt, now),
    licenseExpiresAt,
  };
}
