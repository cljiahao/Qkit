import { describe, it, expect, vi, beforeEach } from "vitest";

// logEvent inserts into `events` via the normal client. Capture the insert.
const insert = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from: () => ({ insert }) }),
}));

import { logEvent } from "./events";

beforeEach(() => insert.mockClear());

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
});
