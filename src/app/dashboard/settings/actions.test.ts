import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc, auth: { getUser } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { updateBoardSettings } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "vendor" } } });
  rpc.mockResolvedValue({ error: null });
});
describe("settings section patch boundary", () => {
  it("sends only the chosen field without injecting defaults", async () => {
    await expect(updateBoardSettings({ sound_id: "bell" })).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("patch_board_settings", {
      p_patch: { sound_id: "bell" },
    });
  });
  it.each([
    {},
    { extra: true },
    { desktop_notify: "true" },
    { undo_seconds: 99 },
  ])(
    "rejects invalid runtime patch %j before database writes",
    async (patch) => {
      await expect(
        updateBoardSettings(patch as Parameters<typeof updateBoardSettings>[0]),
      ).resolves.toMatchObject({ success: false });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("requires a signed-in vendor", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(
      updateBoardSettings({ sound_id: "bell" }),
    ).resolves.toMatchObject({ success: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports rejected merged timing values from the database", async () => {
    rpc.mockResolvedValue({ error: { message: "Invalid merged thresholds" } });
    await expect(updateBoardSettings({ aging_min: 20 })).resolves.toMatchObject(
      { success: false },
    );
  });
});
