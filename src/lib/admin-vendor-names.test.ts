// src/lib/admin-vendor-names.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));

import { vendorStallNames } from "./admin-vendor-names";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
});

describe("vendorStallNames", () => {
  it("resolves one stall name per unique vendor id, in parallel", async () => {
    getOrCreateVendorProfile.mockImplementation((_client, id: string) =>
      Promise.resolve({
        vendor_id: id,
        stall_name: `Stall ${id}`,
        social_links: {},
      }),
    );

    const result = await vendorStallNames({} as never, ["v1", "v2"]);

    expect(result.get("v1")).toBe("Stall v1");
    expect(result.get("v2")).toBe("Stall v2");
    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates repeated vendor ids into a single RPC call each", async () => {
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Stall v1",
      social_links: {},
    });

    await vendorStallNames({} as never, ["v1", "v1", "v1"]);

    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map for an empty id list without calling the RPC", async () => {
    const result = await vendorStallNames({} as never, []);

    expect(result.size).toBe(0);
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
