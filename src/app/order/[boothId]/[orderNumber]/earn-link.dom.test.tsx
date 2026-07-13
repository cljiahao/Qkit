// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EarnLink } from "./earn-link";

afterEach(() => vi.restoreAllMocks());

describe("EarnLink", () => {
  it("renders nothing when loopkit says not enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ enabled: false }), { status: 200 }),
    );
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });

  it("renders a link with the program name when enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ enabled: true, program_name: "Coffee Stamps" }),
        { status: 200 },
      ),
    );
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://loopkit.example/earn?order=o1",
    );
    expect(link).toHaveTextContent(/coffee stamps/i);
  });

  it("renders nothing when the fetch fails (fail closed, never blocks the order page)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });
});
