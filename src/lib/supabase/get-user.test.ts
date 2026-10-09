import { beforeEach, describe, expect, it, vi } from "vitest";
const { current } = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getUser: current } }),
}));
import { getUser } from "./get-user";
beforeEach(() => {
  current.mockReset();
});
describe("current authenticated user", () => {
  it("returns the verified server user", async () => {
    current.mockResolvedValue({ data: { user: { id: "a" } } });
    expect(await getUser()).toEqual({ id: "a" });
  });
  it("keeps an anonymous session anonymous", async () => {
    current.mockResolvedValue({ data: { user: null } });
    expect(await getUser()).toBeNull();
  });
  it("surfaces transport failures instead of turning them into anonymous sessions", async () => {
    current.mockRejectedValue(new Error("Unavailable"));
    await expect(getUser()).rejects.toThrow("Unavailable");
  });
});
