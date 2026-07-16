import { describe, expect, it, vi, beforeEach } from "vitest";
import { createVendor } from "./actions";

const { getUser, insert } = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      auth: { getUser },
      from: () => ({ insert }),
    }),
}));

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  insert.mockReset().mockResolvedValue({ error: null });
});

describe("createVendor", () => {
  it("rejects an empty name before checking auth", async () => {
    const res = await createVendor({ name: "" });
    expect(res).toEqual({ success: false, error: "Invalid stall name" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects when not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await createVendor({ name: "Kopi Cart" });
    expect(res).toEqual({ success: false, error: "Not authenticated" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates the vendor row keyed on the auth user id", async () => {
    const res = await createVendor({ name: "Kopi Cart" });
    expect(res).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({ id: "v1", name: "Kopi Cart" });
  });

  it("treats a unique-violation (already onboarded) as success", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    const res = await createVendor({ name: "Kopi Cart" });
    expect(res).toEqual({ success: true });
  });

  it("surfaces a friendly error on any other insert failure", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const res = await createVendor({ name: "Kopi Cart" });
    expect(res).toEqual({ success: false, error: "Could not create vendor" });
  });
});
