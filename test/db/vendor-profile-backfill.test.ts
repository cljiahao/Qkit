import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0053_vendor_profile_backfill.sql",
      import.meta.url,
    ),
  ),
  "utf8",
).toLowerCase();

describe("0053_vendor_profile_backfill migration", () => {
  it("inserts into merqo.vendor_profile from qkit.vendors", () => {
    expect(sql).toMatch(
      /insert into merqo\.vendor_profile\s*\(vendor_id,\s*stall_name,\s*social_links\)/,
    );
    expect(sql).toMatch(
      /select\s+id,\s*name,\s*social_links\s+from qkit\.vendors/,
    );
  });

  it("is idempotent (ON CONFLICT DO NOTHING, not a blind insert)", () => {
    expect(sql).toMatch(/on conflict\s*\(\s*vendor_id\s*\)\s*do nothing/);
  });
});
