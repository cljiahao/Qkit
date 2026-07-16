import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above plain `const` declarations, so any
// mock referenced inside a factory must itself come from vi.hoisted (a bare
// `const upsertVendorProfile = vi.fn()` above vi.mock throws a temporal-dead-
// zone ReferenceError as soon as actions.ts imports the mocked module).
const { upsertVendorProfile, getOrCreateVendorProfile, getUser } = vi.hoisted(
  () => ({
    upsertVendorProfile: vi.fn(),
    getOrCreateVendorProfile: vi.fn(),
    getUser: vi.fn(),
  }),
);

vi.mock("@/lib/merqo-vendor-profile", () => ({
  upsertVendorProfile,
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
  upsertVendorProfile.mockReset();
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "v1" } } });
  // Both actions read the current profile first (see actions.ts) before
  // upserting the one changed field.
  getOrCreateVendorProfile.mockResolvedValue({
    vendor_id: "v1",
    stall_name: "Existing",
    social_links: {},
  });
});

describe("updateStallName", () => {
  it("calls upsertVendorProfile with the new name and existing social links unset (name-only save)", async () => {
    upsertVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "New Name",
      social_links: {},
    });
    const result = await updateStallName({ name: "New Name" });
    expect(result.success).toBe(true);
    expect(upsertVendorProfile).toHaveBeenCalled();
  });

  it("returns an error for an invalid name without calling upsertVendorProfile", async () => {
    const result = await updateStallName({ name: "" });
    expect(result.success).toBe(false);
    expect(upsertVendorProfile).not.toHaveBeenCalled();
  });
});

describe("updateSocialLinks", () => {
  it("calls upsertVendorProfile with the parsed links", async () => {
    upsertVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Existing",
      social_links: { website: "https://example.com" },
    });
    const result = await updateSocialLinks({ website: "https://example.com" });
    expect(result.success).toBe(true);
    expect(upsertVendorProfile).toHaveBeenCalled();
  });
});
