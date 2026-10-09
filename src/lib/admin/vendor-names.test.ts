// src/lib/admin/vendor-names.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
}));
vi.mock("@/lib/merqo/vendor-profile", () => ({ getOrCreateVendorProfile }));

import { vendorStallNames } from "./vendor-names";

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

  it("limits concurrent profile requests and preserves mapping across out-of-order completion", async () => {
    const releases: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    getOrCreateVendorProfile.mockImplementation((_client, id: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      return new Promise((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve({ stall_name: `Stall ${id}` });
        });
      });
    });
    const ids = Array.from({ length: 17 }, (_, index) => `vendor-${index}`);
    const result = vendorStallNames({} as never, [...ids, ids[0]]);
    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(8);
    releases
      .splice(0)
      .reverse()
      .forEach((release) => release());
    await vi.waitFor(() =>
      expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(16),
    );
    releases
      .splice(0)
      .reverse()
      .forEach((release) => release());
    await vi.waitFor(() =>
      expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(17),
    );
    releases.splice(0).forEach((release) => release());
    expect([...(await result)]).toEqual(ids.map((id) => [id, `Stall ${id}`]));
    expect(maximum).toBe(8);
    expect(active).toBe(0);
  });

  it("rejects failed profile reads without starting later batches or returning partial names", async () => {
    getOrCreateVendorProfile.mockRejectedValueOnce(
      new Error("Profile unavailable"),
    );
    getOrCreateVendorProfile.mockResolvedValue({ stall_name: "Available" });
    await expect(
      vendorStallNames(
        {} as never,
        Array.from({ length: 9 }, (_, index) => `vendor-${index}`),
      ),
    ).rejects.toThrow("Profile unavailable");
    expect(getOrCreateVendorProfile).toHaveBeenCalledTimes(8);
  });
});
