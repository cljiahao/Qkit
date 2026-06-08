import { describe, expect, it } from "vitest";
import { vendorSchema } from "./schemas";

describe("vendorSchema", () => {
  it("accepts a valid stall name", () => {
    expect(vendorSchema.safeParse({ name: "Mama's Kitchen" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(vendorSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(vendorSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});
