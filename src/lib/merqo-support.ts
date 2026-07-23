import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shape of the merqo.submit_support_message RPC — merqo owns this
 * function's real generated types; this is a hand-written mirror of the
 * RPC contract, not a generated type, since merqo.* is outside qkit's own
 * supabase gen types scope (schema: "qkit"). See
 * merqo/docs/superpowers/specs/2026-07-23-cross-kit-support-messages-remaining-kits-design.md.
 */
type MerqoSupportSchema = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      submit_support_message: {
        Args: { p_kit_slug: string; p_category: string; p_body: string };
        Returns: { id: string };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export async function submitSupportMessage<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  category: string,
  body: string,
): Promise<void> {
  const merqoClient = supabase as unknown as SupabaseClient<MerqoSupportSchema>;
  const { error } = await merqoClient
    .schema("merqo")
    .rpc("submit_support_message", {
      p_kit_slug: "qkit",
      p_category: category,
      p_body: body,
    });
  if (error) {
    throw new Error(`submit_support_message failed: ${error.message}`);
  }
}
