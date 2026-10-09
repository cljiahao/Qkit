import { describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "fraunces" }),
  Hanken_Grotesk: () => ({ variable: "hanken" }),
  Space_Mono: () => ({ variable: "space" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: createClient }));
import RootLayout from "./layout";

describe("optional root maintenance banner", () => {
  it("keeps the application available when client creation rejects", async () => {
    createClient.mockRejectedValueOnce(new Error("Offline"));
    const root = await RootLayout({ children: "Content" });
    expect(root.props.children.props.children[1].props).toEqual({
      enabled: false,
      message: "",
    });
  });
  it("keeps the application available when the banner query rejects", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => {
        throw new Error("Offline");
      },
    };
    createClient.mockResolvedValueOnce({ from: () => query });
    const root = await RootLayout({ children: "Content" });
    expect(root.props.children.props.children[1].props).toEqual({
      enabled: false,
      message: "",
    });
  });
});
