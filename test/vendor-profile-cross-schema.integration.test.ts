import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// De-risking spike for docs/superpowers/plans/2026-07-16-shared-vendor-profile.md
// Task 2: proves supabase.schema("merqo").rpc(...) works from a client
// configured with db.schema = "qkit" (mirrors every real qkit server
// client), against the live shared Supabase project. Opt-in like
// order-numbering.integration.test.ts — the default `pnpm test` run skips it.
//
//   PowerShell:  $env:RUN_DB_TESTS=1; pnpm test
//   bash:        RUN_DB_TESTS=1 pnpm test
const RUN = !!process.env.RUN_DB_TESTS;

function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trimStart().startsWith("#")) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

describe.skipIf(!RUN)(
  "merqo.vendor_profile cross-schema RPC (integration)",
  () => {
    // vitest.config.ts injects a dummy NEXT_PUBLIC_SUPABASE_URL into
    // process.env for every test run (so non-integration tests don't need
    // real credentials) — .env.local must win here or this always targets
    // the dummy localhost value instead of the real DB.
    const env = { ...process.env, ...loadEnvLocal() };
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = env.SUPABASE_SECRET_KEY;

    it("get_or_create_vendor_profile is callable via .schema('merqo').rpc(...) from a qkit-scoped client", async () => {
      if (!url || !secret)
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)",
        );

      // db.schema: "qkit" — identical config to every real qkit server client
      // (src/lib/supabase/server.ts). The whole point of this test is proving
      // .schema("merqo") can override that default for one call.
      const db = createClient(url, secret, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "qkit" },
      });

      const vendorId = randomUUID();
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
    });
  },
);
