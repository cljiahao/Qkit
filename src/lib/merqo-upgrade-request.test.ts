import { describe, it, expect } from "vitest";
import { resolveUpgradeOutcome } from "./merqo-upgrade-request";

describe("resolveUpgradeOutcome", () => {
  it("returns not_found when there's no vendor row, regardless of pending state", () => {
    expect(resolveUpgradeOutcome(false, false)).toBe("not_found");
    expect(resolveUpgradeOutcome(false, true)).toBe("not_found");
  });

  it("returns already_pending when a vendor row exists and a pending request already exists", () => {
    expect(resolveUpgradeOutcome(true, true)).toBe("already_pending");
  });

  it("returns create when a vendor row exists and no pending request exists", () => {
    expect(resolveUpgradeOutcome(true, false)).toBe("create");
  });
});
