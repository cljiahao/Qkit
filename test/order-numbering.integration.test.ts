import { integrationDbEnv } from "./db-env";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Opt in with RUN_DB_TESTS=1 and isolated QKIT_TEST_SUPABASE_* credentials.
const RUN = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN)("next_order_number concurrency (integration)", () => {
  let db: SupabaseClient<Database>;
  let userId: string;
  let boothId: string;

  beforeAll(async () => {
    const { url, secret } = integrationDbEnv();

    // Service-role (secret) key bypasses RLS — fine here, this is a server-side
    // test seeding and tearing down its own throwaway data.
    db = createClient<Database>(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "qkit" },
    });

    // Seed the FK chain: auth user → vendor → booth.
    const email = `concurrency-test-${process.pid}-${process.hrtime.bigint()}@example.test`;
    const { data: u, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "test-password-123!",
      email_confirm: true,
    });
    if (uErr || !u.user) throw uErr ?? new Error("createUser failed");
    userId = u.user.id;

    const { error: vErr } = await db.from("vendors").insert({ id: userId });
    if (vErr) throw vErr;

    const { data: b, error: bErr } = await db
      .from("booths")
      .insert({ vendor_id: userId, name: "Race Booth", is_active: true })
      .select("id")
      .single();
    if (bErr || !b) throw bErr ?? new Error("booth insert failed");
    boothId = b.id;
  });

  afterAll(async () => {
    if (!db) return;
    // Remove the test fixture explicitly before deleting its auth user.
    if (boothId) {
      await db.from("orders").delete().eq("booth_id", boothId);
      await db.from("booths").delete().eq("id", boothId);
    }
    if (userId) {
      await db.from("vendors").delete().eq("id", userId);
      await db.auth.admin.deleteUser(userId);
    }
  });

  it("assigns distinct, sequential numbers under N concurrent placements", async () => {
    const N = 25;

    // Exercise the service-only counter directly; public placement uses the
    // constrained place_order RPC rather than separate counter and INSERT calls.
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const { data: orderNumber, error: numErr } = await db.rpc(
          "next_order_number",
          { p_booth_id: boothId },
        );
        if (numErr || !orderNumber)
          throw numErr ?? new Error("rpc returned null");

        const { error: insErr } = await db.from("orders").insert({
          booth_id: boothId,
          order_number: orderNumber,
          customer_name: `Cust ${i}`,
          items: [],
          total_cents: 0,
          status: "preparing",
        });
        if (insErr)
          throw new Error(`insert ${i}: ${insErr.code} ${insErr.message}`);
        return orderNumber;
      }),
    );

    // No collisions: N distinct numbers.
    expect(new Set(results).size).toBe(N);

    // Fresh booth (order_seq seeded to 0) → exactly 0001..00NN, no gaps.
    const sorted = results.map(Number).sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    // And the table agrees: N rows actually landed.
    const { count } = await db
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("booth_id", boothId);
    expect(count).toBe(N);
  });
});
