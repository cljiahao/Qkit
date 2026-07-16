import { describe, it, expect, vi } from "vitest";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "./merqo-vendor-profile";

function makeMockClient(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const schema = vi.fn().mockReturnValue({ rpc });
  return { client: { schema } as never, rpc, schema };
}

describe("getOrCreateVendorProfile", () => {
  it("calls .schema('merqo').rpc('get_or_create_vendor_profile', ...) with the vendor id and default name", async () => {
    const row = {
      vendor_id: "v1",
      stall_name: "Kopitiam Cart",
      social_links: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const { client, rpc, schema } = makeMockClient({ data: row, error: null });

    const result = await getOrCreateVendorProfile(
      client,
      "v1",
      "Kopitiam Cart",
    );

    expect(schema).toHaveBeenCalledWith("merqo");
    expect(rpc).toHaveBeenCalledWith("get_or_create_vendor_profile", {
      p_vendor_id: "v1",
      p_default_stall_name: "Kopitiam Cart",
    });
    expect(result).toEqual(row);
  });

  it("throws with the Postgres error message on failure", async () => {
    const { client } = makeMockClient({
      data: null,
      error: { message: "connection refused" },
    });
    await expect(getOrCreateVendorProfile(client, "v1", null)).rejects.toThrow(
      "get_or_create_vendor_profile failed: connection refused",
    );
  });
});

describe("upsertVendorProfile", () => {
  it("calls .schema('merqo').rpc('upsert_vendor_profile', ...) with stall name and social links", async () => {
    const row = {
      vendor_id: "v1",
      stall_name: "New Name",
      social_links: { website: "https://example.com" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const { client, rpc, schema } = makeMockClient({ data: row, error: null });

    const result = await upsertVendorProfile(client, "v1", "New Name", {
      website: "https://example.com",
    });

    expect(schema).toHaveBeenCalledWith("merqo");
    expect(rpc).toHaveBeenCalledWith("upsert_vendor_profile", {
      p_vendor_id: "v1",
      p_stall_name: "New Name",
      p_social_links: { website: "https://example.com" },
    });
    expect(result).toEqual(row);
  });
});
