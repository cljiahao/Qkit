import { integrationDbEnv } from "./db-env";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Opt in with RUN_DB_TESTS=1 and isolated QKIT_TEST_SUPABASE_* credentials.
const RUN = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN)(
  "merqo.vendor_profile cross-schema RPC (integration)",
  () => {
    it("get_or_create_vendor_profile is callable via .schema('merqo').rpc(...) from a qkit-scoped client", async () => {
      const { url, secret } = integrationDbEnv();

      // db.schema: "qkit" — identical config to every real qkit server client
      // (src/lib/supabase/server.ts). The whole point of this test is proving
      // .schema("merqo") can override that default for one call.
      const db = createClient(url, secret, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "qkit" },
      });

      const vendorId = randomUUID();
      try {
        const { data, error } = await db
          .schema("merqo")
          .rpc("get_or_create_vendor_profile", {
            p_vendor_id: vendorId,
            p_default_stall_name: "Spike Test Stall",
          });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          vendor_id: vendorId,
          stall_name: "Spike Test Stall",
          social_links: {},
        });
      } finally {
        const { error } = await db
          .schema("merqo")
          .from("vendor_profile")
          .delete()
          .eq("vendor_id", vendorId);
        if (error) throw error;
      }
    });
  },
);
