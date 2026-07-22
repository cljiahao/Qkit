import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0070_get_booth_for_order_vendor_profile_social_links.sql",
      import.meta.url,
    ),
  ),
  "utf8",
).toLowerCase();

describe("0070_get_booth_for_order_vendor_profile_social_links migration", () => {
  it("resolves the vendor-level social_links fallback from merqo.vendor_profile, not the dropped qkit.vendors column", () => {
    expect(sql).toMatch(/create or replace function qkit\.get_booth_for_order/);
    expect(sql).toMatch(
      /from merqo\.vendor_profile where vendor_id = b\.vendor_id/,
    );
    expect(sql).not.toMatch(/from qkit\.vendors where id = b\.vendor_id/);
  });

  it("guards the merqo.vendor_profile read so a fresh qkit-only CI/local DB doesn't hard-fail", () => {
    expect(sql).toMatch(
      /where table_schema = 'merqo' and table_name = 'vendor_profile'/,
    );
  });
});
