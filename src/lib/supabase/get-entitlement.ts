import { createServerClient } from "@/lib/supabase/server";
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
export async function loadEntitlement(): Promise<{
  user: User | null;
  vendor: Vendor | null;
  entitlement: Entitlement;
  licenseExpiresAt: string | null;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = Date.now();

  if (!user) {
    return {
      user: null,
      vendor: null,
      entitlement: getEntitlement("free", null, now),
      licenseExpiresAt: null,
    };
  }

  // Take the latest-EXPIRING license (DESC on expires_at), not the most-recently
  // minted — overlapping passes should grant the longest window.
  const [{ data: vendor }, { data: license }] = await Promise.all([
    supabase.from("vendors").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("licenses")
      .select("expires_at")
      .eq("vendor_id", user.id)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const licenseExpiresAt = vendor ? (license?.expires_at ?? null) : null;
  return {
    user,
    vendor: vendor ?? null,
    entitlement: getEntitlement(vendor?.plan ?? "free", licenseExpiresAt, now),
    licenseExpiresAt,
  };
}
