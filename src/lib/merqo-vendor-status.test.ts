import { describe, it, expect } from "vitest";
import { resolveVendorStatus } from "./merqo-vendor-status";

const authUsers = [
  { id: "u1", email: "alice@example.com" },
  { id: "u2", email: "BOB@Example.com" },
];
const vendors = [{ id: "u1", plan: "pro" as const }];

describe("resolveVendorStatus", () => {
  it("active + plan when the email's auth user has a vendors row", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, vendors);
    expect(r).toEqual({ active: true, plan: "pro" });
  });

  it("matches email case-insensitively", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, [
      { id: "u2", plan: "free" as const },
    ]);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("inactive when no auth user matches the email", () => {
    const r = resolveVendorStatus("nobody@example.com", authUsers, vendors);
    expect(r).toEqual({ active: false, plan: null });
  });

  it("inactive when the auth user exists but has no vendors row", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, vendors);
    expect(r).toEqual({ active: false, plan: null });
  });
});
