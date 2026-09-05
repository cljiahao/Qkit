import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getUserMock,
  redirectMock,
  requireCurrentLegalAcceptanceMock,
  maybeSingle,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireCurrentLegalAcceptanceMock: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/get-user", () => ({ getUser: getUserMock }));
vi.mock("@/lib/legal-gate", () => ({
  requireCurrentLegalAcceptance: requireCurrentLegalAcceptanceMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

import { requireVendor } from "./get-vendor";

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  requireCurrentLegalAcceptanceMock.mockResolvedValue(undefined);
});

describe("requireVendor legal gate", () => {
  it("passes the signed-in vendor's email through the legal-acceptance gate", async () => {
    getUserMock.mockResolvedValue({ id: "v1", email: "vendor@example.com" });
    maybeSingle.mockResolvedValue({
      data: { id: "v1", board_settings: { aging_min: 5 } },
      error: null,
    });

    const result = await requireVendor();

    expect(requireCurrentLegalAcceptanceMock).toHaveBeenCalledWith(
      "vendor@example.com",
    );
    expect(result.vendor.id).toBe("v1");
  });

  it("bounces to /legal/accept when the gate redirects (stale acceptance)", async () => {
    getUserMock.mockResolvedValue({ id: "v1", email: "vendor@example.com" });
    maybeSingle.mockResolvedValue({
      data: { id: "v1", board_settings: { aging_min: 5 } },
      error: null,
    });
    requireCurrentLegalAcceptanceMock.mockRejectedValue(
      new Error("REDIRECT:/legal/accept"),
    );

    await expect(requireVendor()).rejects.toThrow("REDIRECT:/legal/accept");
  });

  it("redirects to /onboarding before ever consulting the legal gate", async () => {
    getUserMock.mockResolvedValue({ id: "v1", email: "vendor@example.com" });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(requireVendor()).rejects.toThrow("REDIRECT:/onboarding");
    expect(requireCurrentLegalAcceptanceMock).not.toHaveBeenCalled();
  });
});
