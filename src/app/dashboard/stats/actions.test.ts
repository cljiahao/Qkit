import { describe, expect, it, vi, beforeEach } from "vitest";
import { renameEvent } from "./actions";

const { loadEntitlementMock, rpc } = vi.hoisted(() => ({
  loadEntitlementMock: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: loadEntitlementMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const LICENSE_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  loadEntitlementMock
    .mockReset()
    .mockResolvedValue({ user: { id: "v1" }, vendor: { id: "v1" } });
  rpc.mockReset().mockResolvedValue({ error: null });
});

describe("renameEvent", () => {
  it("rejects an invalid input before checking auth", async () => {
    const res = await renameEvent({ licenseId: "not-a-uuid", label: "x" });
    expect(res).toEqual({ success: false, error: "Invalid name" });
    expect(loadEntitlementMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in", async () => {
    loadEntitlementMock.mockResolvedValue({ user: null, vendor: null });
    const res = await renameEvent({ licenseId: LICENSE_ID, label: "Fair" });
    expect(res).toEqual({ success: false, error: "Not signed in" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("renames via set_license_label, scoped to the signed-in vendor by the RPC itself", async () => {
    const res = await renameEvent({ licenseId: LICENSE_ID, label: "Fair" });
    expect(res).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("set_license_label", {
      p_license_id: LICENSE_ID,
      p_label: "Fair",
    });
  });

  it("clears the label with null when given an empty string", async () => {
    await renameEvent({ licenseId: LICENSE_ID, label: "" });
    expect(rpc).toHaveBeenCalledWith("set_license_label", {
      p_license_id: LICENSE_ID,
      p_label: null,
    });
  });

  it("surfaces a friendly error when the RPC fails (e.g. license not yours)", async () => {
    rpc.mockResolvedValue({ error: { message: "no matching license" } });
    const res = await renameEvent({ licenseId: LICENSE_ID, label: "Fair" });
    expect(res).toEqual({
      success: false,
      error: "Could not rename — please try again.",
    });
  });
});
