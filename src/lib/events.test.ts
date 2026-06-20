import { describe, it, expect } from "vitest";
import { eventLabel } from "./events";

describe("eventLabel", () => {
  it("uses the vendor's label when set", () => {
    expect(
      eventLabel({
        label: "Sat Night Market",
        valid_from: "2026-06-07T00:00:00Z",
      }),
    ).toBe("Sat Night Market");
  });

  it("trims the label", () => {
    expect(
      eventLabel({
        label: "  Food Fair  ",
        valid_from: "2026-06-07T00:00:00Z",
      }),
    ).toBe("Food Fair");
  });

  it("falls back to a dated default when there is no label", () => {
    // 2026-06-07T05:00:00Z → 13:00 SGT, same day → "7 Jun".
    expect(
      eventLabel({ label: null, valid_from: "2026-06-07T05:00:00Z" }),
    ).toBe("Pass · 7 Jun");
  });

  it("falls back when the label is only whitespace", () => {
    expect(
      eventLabel({ label: "   ", valid_from: "2026-06-07T05:00:00Z" }),
    ).toBe("Pass · 7 Jun");
  });
});
