import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0073_drop_stale_local_feedback_support.sql",
      import.meta.url,
    ),
  ),
  "utf8",
).toLowerCase();

describe("0073_drop_stale_local_feedback_support migration", () => {
  it("deletes stale local vendor-sourced feedback rows and drops the dead nps column", () => {
    expect(sql).toMatch(/delete from qkit\.feedback where source = 'vendor'/);
    expect(sql).toMatch(/alter table qkit\.feedback/);
    expect(sql).toMatch(/drop column nps/);
  });

  it("drops the fully-superseded local support_messages table", () => {
    expect(sql).toMatch(/drop table qkit\.support_messages/);
  });
});
