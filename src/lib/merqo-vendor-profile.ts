import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shape returned by merqo's get_or_create_vendor_profile / upsert_vendor_profile.
 * merqo owns this table's real generated types — this is a hand-written
 * mirror of the RPC contract, not a generated type, since merqo.* is outside
 * qkit's own supabase gen types scope (schema: "qkit").
 */
export type VendorProfile = {
  vendor_id: string;
  stall_name: string;
  social_links: Record<string, string>;
  created_at: string;
  updated_at: string;
};

type MerqoSchema = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_or_create_vendor_profile: {
        Args: { p_vendor_id: string; p_default_stall_name: string | null };
        Returns: VendorProfile;
      };
      upsert_vendor_profile: {
        Args: {
          p_vendor_id: string;
          p_stall_name: string;
          p_social_links: Record<string, string>;
        };
        Returns: VendorProfile;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Callers pass in a client already scoped to their own (e.g. qkit) Database
 * and schema name — this file must accept whatever concrete instantiation
 * that is. A bare `SupabaseClient` defaults its schema-name param to
 * `"public"`, which real callers (scoped to `"qkit"`) don't structurally
 * match, and pinning params to `never` doesn't match either. Declaring the
 * functions generic over the caller's own Database/SchemaName lets each
 * call site's concrete client type flow in unchanged; the body then
 * re-asserts it against MerqoSchema for the one cross-schema call.
 */
export async function getOrCreateVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  defaultStallName: string | null,
): Promise<VendorProfile> {
  const merqoClient = supabase as unknown as SupabaseClient<MerqoSchema>;
  const { data, error } = await merqoClient
    .schema("merqo")
    .rpc("get_or_create_vendor_profile", {
      p_vendor_id: vendorId,
      p_default_stall_name: defaultStallName,
    });
  if (error) {
    throw new Error(`get_or_create_vendor_profile failed: ${error.message}`);
  }
  return data;
}

export async function upsertVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  stallName: string,
  socialLinks: Record<string, string>,
): Promise<VendorProfile> {
  const merqoClient = supabase as unknown as SupabaseClient<MerqoSchema>;
  const { data, error } = await merqoClient
    .schema("merqo")
    .rpc("upsert_vendor_profile", {
      p_vendor_id: vendorId,
      p_stall_name: stallName,
      p_social_links: socialLinks,
    });
  if (error) {
    throw new Error(`upsert_vendor_profile failed: ${error.message}`);
  }
  return data;
}
