import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Integration test for migration 0008 (atomic per-booth order numbering).
// Hits a REAL Supabase, so it is opt-in: the default `pnpm test` run skips it
// (the dev DB may be down — see CLAUDE.md). Run it against a live DB with the
// migration applied:
//
//   PowerShell:  $env:RUN_DB_TESTS=1; pnpm test
//   bash:        RUN_DB_TESTS=1 pnpm test
const RUN = !!process.env.RUN_DB_TESTS;

/** Minimal .env.local reader — the repo does not depend on dotenv. */
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

describe.skipIf(!RUN)("next_order_number concurrency (integration)", () => {
  // vitest.config.ts injects a dummy NEXT_PUBLIC_SUPABASE_URL into
  // process.env for every test run (so non-integration tests don't need
  // real credentials) — .env.local must win here or this always targets
  // the dummy localhost value instead of the real DB.
  const env = { ...process.env, ...loadEnvLocal() };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;

  let db: SupabaseClient<Database>;
  let userId: string;
  let boothId: string;

  beforeAll(async () => {
    if (!url || !secret)
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)",
      );

    // Service-role (secret) key bypasses RLS — fine here, this is a server-side
    // test seeding and tearing down its own throwaway data.
    db = createClient<Database>(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
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
    // orders → booths has no ON DELETE CASCADE, so delete orders first.
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

    // Mirror placeOrder: atomically claim a number via the rpc, then insert the
    // order. All N fire at once so they race on UNIQUE (booth_id, order_number).
    // Pre-0008 this raced on COUNT(*) and collided; the row-locked counter must
    // now hand out N distinct values with zero 23505s.
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
