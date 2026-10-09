import { describe, it, expect, vi } from "vitest";
import { patchVendorProfile } from "./merqo-vendor-profile";
function clientFor(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { schema: () => ({ rpc }) } as never, rpc };
}
describe("shared profile partial patch", () => {
  it("writes a name without copying links", async () => {
    const { client, rpc } = clientFor({ stall_name: "New" });
    await patchVendorProfile(client, "vendor", { stallName: "New" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("patch_vendor_profile", {
      p_vendor_id: "vendor",
      p_stall_name: "New",
      p_social_links: null,
    });
  });
  it("clears links without copying the name", async () => {
    const { client, rpc } = clientFor({ social_links: {} });
    await patchVendorProfile(client, "vendor", { socialLinks: {} });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("patch_vendor_profile", {
      p_vendor_id: "vendor",
      p_stall_name: null,
      p_social_links: {},
    });
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: "offline" } },
  ])("rejects failed writes", async (value) => {
    const { client } = clientFor(value.data, value.error);
    await expect(
      patchVendorProfile(client, "vendor", { stallName: "New" }),
    ).rejects.toThrow("patch_vendor_profile failed");
  });
});
