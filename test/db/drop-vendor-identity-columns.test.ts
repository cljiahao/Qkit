import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0069_drop_vendor_identity_columns.sql",
      import.meta.url,
    ),
  ),
  "utf8",
).toLowerCase();

describe("0069_drop_vendor_identity_columns migration", () => {
  it("drops the stale name and social_links columns from qkit.vendors", () => {
    expect(sql).toMatch(/alter table qkit\.vendors/);
    expect(sql).toMatch(/drop column name/);
    expect(sql).toMatch(/drop column social_links/);
  });
});
