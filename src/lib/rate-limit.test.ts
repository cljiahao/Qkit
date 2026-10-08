import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "./rate-limit";

function hdrs(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })),
    ).toBe("203.0.113.5");
  });

  it("trims whitespace around the first hop", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "  203.0.113.5 , 70.41.3.18" })),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(clientIp(hdrs({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is empty", () => {
    expect(
      clientIp(hdrs({ "x-forwarded-for": "", "x-real-ip": "198.51.100.7" })),
    ).toBe("198.51.100.7");
  });

  it("returns 'unknown' when neither header is present", () => {
    expect(clientIp(hdrs({}))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(createServiceClient).mockReset();
    vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks the requested bucket through the service client", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    expect(await rateLimit("order:test", 8, 60)).toBe(true);
    expect(createServiceClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "order:test",
      p_limit: 8,
      p_window_seconds: 60,
    });
  });

  it("rejects a request when the database denies the bucket", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    expect(await rateLimit("order:test", 8, 60)).toBe(false);
  });

  it("fails open on an RPC error without logging the private bucket", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Sensitive key: private-token" },
    });

    expect(await rateLimit("private-token", 8, 60)).toBe(true);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit degraded (failing open)",
    );
  });

  it("fails open on a thrown RPC failure without logging its contents", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("Sensitive key: private-token"));

    expect(await rateLimit("private-token", 8, 60)).toBe(true);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit degraded (failing open)",
    );
  });

  it("fails open when the service client cannot be created", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createServiceClient).mockRejectedValue(new Error("Unavailable"));

    expect(await rateLimit("order:test", 8, 60)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
      "rateLimit degraded (failing open)",
    );
  });
});
