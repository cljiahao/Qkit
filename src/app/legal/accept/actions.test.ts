import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { redirectMock, getUserMock, upsertMock, headersMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn(),
    getUserMock: vi.fn(),
    upsertMock: vi.fn(),
    headersMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
  createServiceClient: async () => ({ from: () => ({ upsert: upsertMock }) }),
}));
vi.mock("@merqo/ui", () => ({
  getLegalDocSource: (doc: string) => `${doc}-source`,
  LEGAL_VERSIONS: {
    terms: "2026-09-04",
    privacy: "2026-09-04",
    pilot: "2026-09-04",
  },
}));

import { acceptLegalTerms } from "./actions";

const originalFetch = global.fetch;
const REAL_IP = "203.0.113.5";
const REAL_UA = "Mozilla/5.0 (test vendor browser)";

function formData(next?: string, legalName = "Jane Vendor"): FormData {
  const fd = new FormData();
  if (next) fd.set("next", next);
  if (legalName) fd.set("legal_name", legalName);
  return fd;
}

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERQO_BASE_URL = "https://merqo.example.com";
  process.env.MERQO_CUSTOMER_SECRET = "test-secret";
  upsertMock.mockResolvedValue({ error: null });
  headersMock.mockResolvedValue(
    new Headers({ "x-forwarded-for": REAL_IP, "user-agent": REAL_UA }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("acceptLegalTerms", () => {
  it("redirects to /login when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const fetchSpy = okFetch();
    global.fetch = fetchSpy as never;

    await acceptLegalTerms(formData());

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts terms and privacy as two independent bearer-authed calls and redirects to next", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "Vendor@Business.sg" } },
    });
    const fetchSpy = okFetch();
    global.fetch = fetchSpy as never;

    await acceptLegalTerms(formData("/dashboard/settings"));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(call[0]).toBe("https://merqo.example.com/api/merqo/legal-accept");
      expect(call[1].headers.Authorization).toBe("Bearer test-secret");
    }
    const bodies = fetchSpy.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0]).toMatchObject({
      vendor_email: "vendor@business.sg",
      auth_uid: "u1",
      doc_type: "terms",
      doc_version: "2026-09-04",
      kit_slug: "qkit",
      legal_name: "Jane Vendor",
      ip: REAL_IP,
      user_agent: REAL_UA,
    });
    expect(bodies[0].doc_sha256).toHaveLength(64);
    expect(bodies[1]).toMatchObject({
      vendor_email: "vendor@business.sg",
      doc_type: "privacy",
      kit_slug: "qkit",
      legal_name: "Jane Vendor",
      ip: REAL_IP,
      user_agent: REAL_UA,
    });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("throws when legal_name is missing from the submitted form data", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    const fetchSpy = okFetch();
    global.fetch = fetchSpy as never;

    await expect(acceptLegalTerms(formData("/dashboard", ""))).rejects.toThrow(
      /legal_name/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("throws when legal_name is only whitespace", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    const fetchSpy = okFetch();
    global.fetch = fetchSpy as never;

    await expect(
      acceptLegalTerms(formData("/dashboard", "   ")),
    ).rejects.toThrow(/legal_name/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("primes the local legal_check_state cache to is_current: true on success", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    global.fetch = okFetch() as never;

    await acceptLegalTerms(formData("/dashboard"));

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "vendor@business.sg",
        is_current: true,
      }),
    );
  });

  it("redirects to /dashboard when no next param is given", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    global.fetch = okFetch() as never;

    await acceptLegalTerms(formData());

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("still posts privacy when terms is a tolerated duplicate (merqo returns 200)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    // merqo maps a 23505 to { ok: true } — both calls independently succeed.
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchSpy as never;

    await acceptLegalTerms(formData("/dashboard"));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(
      fetchSpy.mock.calls.map((c) => JSON.parse(c[1].body).doc_type),
    ).toEqual(["terms", "privacy"]);
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("throws when merqo responds non-2xx (no redirect)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as never;

    await expect(acceptLegalTerms(formData("/dashboard"))).rejects.toThrow(
      /legal-accept/,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("throws when MERQO_CUSTOMER_SECRET is unset", async () => {
    delete process.env.MERQO_CUSTOMER_SECRET;
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    const fetchSpy = okFetch();
    global.fetch = fetchSpy as never;

    await expect(acceptLegalTerms(formData())).rejects.toThrow(
      /MERQO_CUSTOMER_SECRET/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an unsafe absolute / protocol-relative next and falls back to /dashboard", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    global.fetch = okFetch() as never;

    await acceptLegalTerms(formData("https://evil.example"));
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");

    redirectMock.mockClear();
    await acceptLegalTerms(formData("//evil.example"));
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("preserves a legitimate relative next path", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@business.sg" } },
    });
    global.fetch = okFetch() as never;

    await acceptLegalTerms(formData("/dashboard/plan"));

    expect(redirectMock).toHaveBeenCalledWith("/dashboard/plan");
  });
});
