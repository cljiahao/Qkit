import { describe, it, expect, vi, beforeEach } from "vitest";

const { patchVendorProfile, getOrCreateVendorProfile, getUser } = vi.hoisted(
  () => ({
    patchVendorProfile: vi.fn(),
    getOrCreateVendorProfile: vi.fn(),
    getUser: vi.fn(),
  }),
);

vi.mock("@/lib/merqo/vendor-profile", () => ({
  patchVendorProfile,
  getOrCreateVendorProfile,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => getUser() },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateStallName, updateSocialLinks } from "./actions";

beforeEach(() => {
  patchVendorProfile.mockReset();
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "v1" } } });
  getOrCreateVendorProfile.mockResolvedValue({
    vendor_id: "v1",
    stall_name: "Existing",
    social_links: {},
  });
});

describe("updateStallName", () => {
  it("calls patchVendorProfile with the new name and existing social links unset (name-only save)", async () => {
    patchVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "New Name",
      social_links: {},
    });
    const result = await updateStallName({ name: "New Name" });
    expect(result.success).toBe(true);
    expect(patchVendorProfile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      "v1",
      { stallName: "New Name" },
    );
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });

  it("returns an error for an invalid name without calling patchVendorProfile", async () => {
    const result = await updateStallName({ name: "" });
    expect(result.success).toBe(false);
    expect(patchVendorProfile).not.toHaveBeenCalled();
  });
});

describe("updateSocialLinks", () => {
  it("calls patchVendorProfile with the parsed links", async () => {
    patchVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Existing",
      social_links: { website: "https://example.com" },
    });
    const result = await updateSocialLinks({ website: "https://example.com" });
    expect(result.success).toBe(true);
    expect(patchVendorProfile).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ auth: expect.any(Object) }),
      "v1",
      { socialLinks: { website: "https://example.com" } },
    );
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});

const profileUpdates = [
  { name: "stall name", run: () => updateStallName({ name: "New Name" }) },
  {
    name: "social links",
    run: () => updateSocialLinks({ website: "https://example.com" }),
  },
];

it.each(profileUpdates)(
  "rejects unsigned $name saves without writes",
  async ({ run }) => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await run()).toEqual({ success: false, error: "Not signed in" });
    expect(patchVendorProfile).not.toHaveBeenCalled();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  },
);

it.each(profileUpdates)(
  "reports failed $name writes without creating a profile",
  async ({ run }) => {
    patchVendorProfile.mockRejectedValue(new Error("Database offline"));
    expect(await run()).toMatchObject({ success: false });
    expect(patchVendorProfile).toHaveBeenCalledTimes(1);
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  },
);

it("rejects unsafe social link protocols before profile writes", async () => {
  const result = await updateSocialLinks({ website: "javascript:alert(1)" });
  expect(result.success).toBe(false);
  expect(patchVendorProfile).not.toHaveBeenCalled();
  expect(getUser).not.toHaveBeenCalled();
});
