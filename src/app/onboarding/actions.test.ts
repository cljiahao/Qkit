// src/app/onboarding/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile, getUser, insert } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => getUser() },
    from: () => ({ insert }),
  }),
}));

import { createVendor } from "./actions";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  insert.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "v1" } } });
  insert.mockResolvedValue({ error: null });
  getOrCreateVendorProfile.mockResolvedValue({
    vendor_id: "v1",
    stall_name: "Kopitiam Cart",
    social_links: {},
  });
});

describe("createVendor", () => {
  it("inserts a bare vendors row and seeds the merqo profile with the chosen name", async () => {
    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({ id: "v1" });
    expect(getOrCreateVendorProfile).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      "Kopitiam Cart",
    );
  });

  it("treats a duplicate-row error (23505) as success and still seeds the profile", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });

    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(true);
    expect(getOrCreateVendorProfile).toHaveBeenCalled();
  });

  it("returns an error for an invalid name without inserting or seeding a profile", async () => {
    const result = await createVendor({ name: "" });

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("surfaces a real insert error without seeding the profile", async () => {
    insert.mockResolvedValue({ error: { code: "500", message: "boom" } });

    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(false);
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("returns an error when not authenticated, without inserting or seeding a profile", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await createVendor({ name: "Kopitiam Cart" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Not authenticated");
    }
    expect(insert).not.toHaveBeenCalled();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
