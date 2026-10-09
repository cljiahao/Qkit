import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateVendorProfile } from "@/lib/merqo/vendor-profile";

/**
 * Resolve unique vendor names in bounded batches so large admin directories
 * cannot launch an RPC for every vendor simultaneously.
 */
export async function vendorStallNames<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(vendorIds)];
  const names = new Map<string, string>();
  for (let offset = 0; offset < uniqueIds.length; offset += 8) {
    const ids = uniqueIds.slice(offset, offset + 8);
    const profiles = await Promise.all(
      ids.map((id) => getOrCreateVendorProfile(supabase, id, null)),
    );
    ids.forEach((id, index) => names.set(id, profiles[index].stall_name));
  }
  return names;
}
