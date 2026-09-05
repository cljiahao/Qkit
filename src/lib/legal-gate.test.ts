import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));

const { createServiceClient } = await import("@/lib/supabase/server");
import { checkLegalAcceptance } from "./legal-gate";

const originalFetch = global.fetch;

function clientWith(opts: {
  cached?: { checked_at: string; is_current: boolean } | null;
  upsert?: ReturnType<typeof vi.fn>;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.cached ?? null });
  const upsert = opts.upsert ?? vi.fn().mockResolvedValue({ error: null });
  return {
    client: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle }) }),
        upsert,
      }),
    },
    maybeSingle,
    upsert,
  };
}

beforeEach(() => {
  process.env.MERQO_BASE_URL = "https://merqo.example.com";
  process.env.MERQO_CUSTOMER_SECRET = "test-secret";
  vi.mocked(createServiceClient).mockReset();
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("checkLegalAcceptance", () => {
  it("returns the cached result within the TTL without calling fetch", async () => {
    const { client } = clientWith({
      cached: { checked_at: new Date().toISOString(), is_current: true },
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;

    const result = await checkLegalAcceptance("Vendor@Example.com");

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls merqo and caches the result when there is no cache row", async () => {
    const { client, upsert } = clientWith({ cached: null });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        terms: "2026-09-04",
        privacy: "2026-09-04",
        pilot: null,
      }),
    });
    global.fetch = fetchSpy as never;

    const result = await checkLegalAcceptance("vendor@example.com");

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain(
      "https://merqo.example.com/api/merqo/legal-status",
    );
    expect(calledUrl).toContain("email=vendor%40example.com");
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer test-secret",
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "vendor@example.com",
        is_current: true,
      }),
    );
  });

  it("re-checks and caches when the cached row is older than the TTL", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { client, upsert } = clientWith({
      cached: { checked_at: stale, is_current: true },
    });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ terms: "1999-01-01", privacy: "1999-01-01" }),
    }) as never;

    const result = await checkLegalAcceptance("vendor@example.com");

    expect(result).toBe(false);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "vendor@example.com",
        is_current: false,
      }),
    );
  });

  it("returns false when merqo reports an out-of-date accepted version", async () => {
    const { client } = clientWith({ cached: null });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ terms: "2026-09-04", privacy: null }),
    }) as never;

    expect(await checkLegalAcceptance("vendor@example.com")).toBe(false);
  });

  it("fails closed (returns false) when merqo is unreachable", async () => {
    const { client } = clientWith({ cached: null });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as never;

    expect(await checkLegalAcceptance("vendor@example.com")).toBe(false);
  });

  it("fails closed (returns false) when merqo responds non-2xx", async () => {
    const { client } = clientWith({ cached: null });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as never;

    expect(await checkLegalAcceptance("vendor@example.com")).toBe(false);
  });

  it("fails closed (returns false) when MERQO_CUSTOMER_SECRET is unset", async () => {
    delete process.env.MERQO_CUSTOMER_SECRET;
    const { client } = clientWith({ cached: null });
    vi.mocked(createServiceClient).mockResolvedValue(client as never);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;

    expect(await checkLegalAcceptance("vendor@example.com")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
