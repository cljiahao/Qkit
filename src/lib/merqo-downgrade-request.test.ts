import { describe, it, expect } from "vitest";
import { resolveDowngradeOutcome } from "./merqo-downgrade-request";

describe("resolveDowngradeOutcome", () => {
  it("returns not_found when there's no vendor row, regardless of plan", () => {
    expect(resolveDowngradeOutcome(false, "free")).toBe("not_found");
    expect(resolveDowngradeOutcome(false, "pro")).toBe("not_found");
  });

  it("returns already_free when a vendor row exists and is already on free", () => {
    expect(resolveDowngradeOutcome(true, "free")).toBe("already_free");
  });

  it("returns downgrade when a vendor row exists and is on pro", () => {
    expect(resolveDowngradeOutcome(true, "pro")).toBe("downgrade");
  });
});
