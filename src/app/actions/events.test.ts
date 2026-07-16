import { describe, it, expect, vi, beforeEach } from "vitest";

// logEvent rate-limits (via the check_rate_limit RPC) before inserting into
// `events` via the normal client. Capture both.
const insert = vi.fn(() => Promise.resolve({ error: null }));
const rpc = vi.fn(
  (): Promise<{ data: boolean | null; error?: { message: string } }> =>
    Promise.resolve({ data: true }),
);
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from: () => ({ insert }), rpc }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { logEvent } from "./events";

beforeEach(() => {
  insert.mockClear();
  rpc.mockClear();
  rpc.mockImplementation(() => Promise.resolve({ data: true }));
});

describe("logEvent", () => {
  it("inserts an allowlisted event with small metadata", async () => {
    await logEvent("upgrade_cta", { feature: "stock" });
    expect(insert).toHaveBeenCalledWith({
      type: "upgrade_cta",
      metadata: { feature: "stock" },
    });
  });

  it("rejects an event type outside the allowlist (no insert)", async () => {
    // @ts-expect-error — exercising the runtime guard with a bad type
    await logEvent("evil_type", { x: 1 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("drops oversized metadata but still logs the event (T27)", async () => {
    await logEvent("landing_cta", { blob: "x".repeat(2000) });
    expect(insert).toHaveBeenCalledWith({ type: "landing_cta" });
  });

  it("drops non-object metadata", async () => {
    await logEvent("landing_cta", "nope" as unknown as Record<string, unknown>);
    expect(insert).toHaveBeenCalledWith({ type: "landing_cta" });
  });

  it("never throws when the insert fails", async () => {
    insert.mockRejectedValueOnce(new Error("boom"));
    await expect(logEvent("landing_cta")).resolves.toBeUndefined();
  });

  it("drops the event when rate-limited (no insert)", async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: false }));
    await logEvent("landing_cta");
    expect(insert).not.toHaveBeenCalled();
  });

  it("still logs when the limiter itself errors (fails open)", async () => {
    rpc.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "degraded" } }),
    );
    await logEvent("landing_cta");
    expect(insert).toHaveBeenCalledWith({ type: "landing_cta" });
  });
});
