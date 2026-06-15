import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server Supabase client and next/navigation. vi.hoisted so the fns
// exist before the (hoisted) vi.mock factories run.
const { maybeSingle, getUser, notFoundMock, fromMock, selectMock, eqMock } =
  vi.hoisted(() => {
    const maybeSingle = vi.fn();
    const eqMock = vi.fn(() => ({ maybeSingle }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      maybeSingle,
      getUser: vi.fn(),
      fromMock,
      selectMock,
      eqMock,
      notFoundMock: vi.fn(() => {
        // Real notFound() throws to halt the request; mirror that so code after
        // it never runs and callers reject.
        throw new Error("NEXT_NOT_FOUND");
      }),
    };
  });

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: fromMock,
    auth: { getUser },
  })),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { isAdmin, requireAdmin } from "./admin";

beforeEach(() => {
  maybeSingle.mockReset();
  getUser.mockReset();
  notFoundMock.mockClear();
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
});

describe("isAdmin", () => {
  it("true when an admins row is visible", async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    expect(await isAdmin("u1")).toBe(true);
  });

  it("false when no row (RLS hides it for non-admins)", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    expect(await isAdmin("u1")).toBe(false);
  });

  it("queries the admins table by user_id", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    await isAdmin("u1");
    expect(fromMock).toHaveBeenCalledWith("admins");
    expect(selectMock).toHaveBeenCalledWith("user_id");
    expect(eqMock).toHaveBeenCalledWith("user_id", "u1");
  });
});

describe("requireAdmin", () => {
  it("404s when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("404s when signed in but not an admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingle.mockResolvedValue({ data: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("returns the user when an admin", async () => {
    const user = { id: "u1" };
    getUser.mockResolvedValue({ data: { user } });
    maybeSingle.mockResolvedValue({ data: { user_id: "u1" } });
    const out = await requireAdmin();
    expect(out.user).toBe(user);
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
