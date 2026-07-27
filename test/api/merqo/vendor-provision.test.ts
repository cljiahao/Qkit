import { describe, it, expect, beforeEach, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

const { getOrCreateVendorProfileMock } = vi.hoisted(() => ({
  getOrCreateVendorProfileMock: vi.fn(),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
}));

import { POST } from "@/app/api/merqo/vendor-provision/route";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function req(body: unknown, auth?: string) {
  return new Request("http://localhost/api/merqo/vendor-provision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

// Chainable insert/select stub: insert() and select().eq().maybeSingle()
// both resolve from the same mock, configured per-test.
function vendorsTable(opts: {
  insertError?: { code: string; message: string } | null;
  planRow?: { plan: string } | null;
  readError?: { message: string } | null;
}) {
  return {
    insert: () => Promise.resolve({ error: opts.insertError ?? null }),
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: opts.planRow ?? null,
            error: opts.readError ?? null,
          }),
      }),
    }),
  };
}

describe("POST /api/merqo/vendor-provision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_PROVISION_SECRET = "test-secret";
    getOrCreateVendorProfileMock.mockResolvedValue({});
  });

  it("401 when the bearer is missing", async () => {
    const res = await POST(req({ user_id: USER_ID }));
    expect(res.status).toBe(401);
  });

  it("400 when user_id is not a UUID", async () => {
    const res = await POST(
      req({ user_id: "not-a-uuid" }, "Bearer test-secret"),
    );
    expect(res.status).toBe(400);
  });

  it("creates a new vendor row, seeds the profile, returns plan free", async () => {
    fromMock.mockReturnValue(
      vendorsTable({ insertError: null, planRow: { plan: "free" } }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: false,
      plan: "free",
    });
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      null,
    );
  });

  it("second call (already exists) is a no-op — does not re-seed the profile", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23505", message: "duplicate key" },
        planRow: { plan: "free" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: true,
      plan: "free",
    });
    expect(getOrCreateVendorProfileMock).not.toHaveBeenCalled();
  });

  it("re-provisioning an already-Pro vendor reports plan pro, not free", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23505", message: "duplicate key" },
        planRow: { plan: "pro" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: true,
      plan: "pro",
    });
  });

  it("400 on a foreign-key violation (unknown user_id)", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23503", message: "fk violation" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(400);
  });

  it("500 when the profile seed throws", async () => {
    fromMock.mockReturnValue(
      vendorsTable({ insertError: null, planRow: { plan: "free" } }),
    );
    getOrCreateVendorProfileMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(500);
  });
});
