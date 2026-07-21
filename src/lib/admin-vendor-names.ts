import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";

/**
 * Resolve each vendor id's stall name from merqo.vendor_profile, one RPC
 * call per unique id, run in parallel. Admin-only, low-traffic call sites —
 * no batch-read RPC exists on the merqo side, and building one isn't
 * justified for this volume (see
 * docs/superpowers/specs/2026-07-21-drop-vendor-identity-columns-design.md).
 */
export async function vendorStallNames<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(vendorIds)];
  const profiles = await Promise.all(
    uniqueIds.map((id) => getOrCreateVendorProfile(supabase, id, null)),
  );
  return new Map(uniqueIds.map((id, i) => [id, profiles[i].stall_name]));
}
