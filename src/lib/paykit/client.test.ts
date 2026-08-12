import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  upsertVendorConfig,
  getVendorConfig,
  createCheckout,
  claimCheckout,
  unclaimCheckout,
  confirmCheckout,
  getCheckoutStatus,
} from "./client";

const VENDOR = "00000000-0000-4000-8000-000000000001";
const TX = "00000000-0000-4000-8000-000000000002";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("PAYKIT_KIT_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_PAYKIT_URL", "https://paykit.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("paykit client — auth/config", () => {
  it("degrades to a clear error without hitting the network when the secret is unset", async () => {
    vi.stubEnv("PAYKIT_KIT_SECRET", "");
    const res = await upsertVendorConfig(VENDOR, {
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
    expect(res).toEqual({
      ok: false,
      status: null,
      error: "Payments are not configured yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the qkit:<secret> bearer header and JSON content-type", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { has_config: true, display_name: "Cart" }),
    );
    await upsertVendorConfig(VENDOR, {
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/vendors/${VENDOR}/config`,
    );
    expect(init.headers.Authorization).toBe("Bearer qkit:test-secret");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
});

describe("upsertVendorConfig", () => {
  it("maps a successful response to camelCase", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { has_config: true, display_name: "Kopitiam Cart" }),
    );
    const res = await upsertVendorConfig(VENDOR, {
      kind: "paynow",
      payee_name: "Kopitiam Cart",
      uen: "53312345A",
    });
    expect(res).toEqual({
      ok: true,
      data: { hasConfig: true, displayName: "Kopitiam Cart" },
    });
  });

  it("surfaces a 400 validation error from the body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: "Provide either a UEN or a mobile number" }),
    );
    const res = await upsertVendorConfig(VENDOR, {
      kind: "paynow",
      payee_name: "Cart",
    });
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: "Provide either a UEN or a mobile number",
    });
  });

  it("reports a network failure without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));
    const res = await upsertVendorConfig(VENDOR, {
      kind: "pointer",
      label: "Pay",
      url: "https://pay.me/x",
    });
    expect(res).toEqual({ ok: false, status: null, error: "fetch failed" });
  });
});

describe("getVendorConfig", () => {
  it("GETs the config route and maps a full paynow config to camelCase", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        has_config: true,
        display_name: "Kopitiam Cart",
        kind: "paynow",
        payee_name: "Kopitiam Cart",
        uen: "53312345A",
        mobile: null,
        label: null,
        url: null,
        qr_image_url: null,
      }),
    );
    const res = await getVendorConfig(VENDOR);
    expect(res).toEqual({
      ok: true,
      data: {
        hasConfig: true,
        displayName: "Kopitiam Cart",
        kind: "paynow",
        payeeName: "Kopitiam Cart",
        uen: "53312345A",
        mobile: null,
        label: null,
        url: null,
        qrImageUrl: null,
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/vendors/${VENDOR}/config`,
    );
    expect(init.method).toBe("GET");
  });

  it("maps a no-config response with every field null", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        has_config: false,
        display_name: null,
        kind: null,
        payee_name: null,
        uen: null,
        mobile: null,
        label: null,
        url: null,
        qr_image_url: null,
      }),
    );
    const res = await getVendorConfig(VENDOR);
    expect(res).toEqual({
      ok: true,
      data: {
        hasConfig: false,
        displayName: null,
        kind: null,
        payeeName: null,
        uen: null,
        mobile: null,
        label: null,
        url: null,
        qrImageUrl: null,
      },
    });
  });

  it("rejects a malformed success body instead of returning garbage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { has_config: true }));
    const res = await getVendorConfig(VENDOR);
    expect(res.ok).toBe(false);
  });

  it("reports a network failure without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));
    const res = await getVendorConfig(VENDOR);
    expect(res).toEqual({ ok: false, status: null, error: "fetch failed" });
  });
});

describe("createCheckout", () => {
  it("maps a qr response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { type: "qr", transaction_id: TX, payload: "0002" }),
    );
    const res = await createCheckout({
      vendorId: VENDOR,
      amountCents: 800,
      orderRef: "order-1",
    });
    expect(res).toEqual({
      ok: true,
      data: { type: "qr", transactionId: TX, payload: "0002" },
    });
  });

  it("maps a link response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        type: "link",
        transaction_id: TX,
        url: "https://pay.me/x",
        label: "PayLah",
      }),
    );
    const res = await createCheckout({
      vendorId: VENDOR,
      amountCents: 800,
      orderRef: "order-1",
    });
    expect(res).toEqual({
      ok: true,
      data: {
        type: "link",
        transactionId: TX,
        url: "https://pay.me/x",
        label: "PayLah",
      },
    });
  });

  it("treats a 422 (no vendor config) as a normal ok:false, not a throw", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { error: "vendor has no PayNow config" }),
    );
    const res = await createCheckout({
      vendorId: VENDOR,
      amountCents: 800,
      orderRef: "order-1",
    });
    expect(res).toEqual({
      ok: false,
      status: 422,
      error: "vendor has no PayNow config",
    });
  });

  it("rejects a malformed success body instead of returning garbage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { type: "qr" }));
    const res = await createCheckout({
      vendorId: VENDOR,
      amountCents: 800,
      orderRef: "order-1",
    });
    expect(res.ok).toBe(false);
  });
});

describe("claimCheckout / unclaimCheckout / confirmCheckout / getCheckoutStatus", () => {
  const statusBody = {
    transaction_id: TX,
    status: "claimed",
    amount_cents: 800,
    order_ref: "order-1",
    claimed_at: "2026-08-11T00:00:00Z",
    confirmed_at: null,
  };

  it("claimCheckout maps the status response to camelCase", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, statusBody));
    const res = await claimCheckout(TX);
    expect(res).toEqual({
      ok: true,
      data: {
        transactionId: TX,
        status: "claimed",
        amountCents: 800,
        orderRef: "order-1",
        claimedAt: "2026-08-11T00:00:00Z",
        confirmedAt: null,
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/checkout/${TX}/claim`,
    );
    expect(init.method).toBe("POST");
  });

  it("unclaimCheckout posts to the unclaim route and maps the reverted status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...statusBody, status: "pending", claimed_at: null }),
    );
    const res = await unclaimCheckout(TX);
    expect(res).toEqual({
      ok: true,
      data: {
        transactionId: TX,
        status: "pending",
        amountCents: 800,
        orderRef: "order-1",
        claimedAt: null,
        confirmedAt: null,
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/checkout/${TX}/unclaim`,
    );
    expect(init.method).toBe("POST");
  });

  it("unclaimCheckout echoes an already-confirmed status unchanged", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...statusBody, status: "confirmed" }),
    );
    const res = await unclaimCheckout(TX);
    expect(res).toEqual({
      ok: true,
      data: expect.objectContaining({ status: "confirmed" }),
    });
  });

  it("confirmCheckout posts to the confirm route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...statusBody, status: "confirmed" }),
    );
    await confirmCheckout(TX);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://paykit.example/api/v1/checkout/${TX}/confirm`,
    );
    expect(init.method).toBe("POST");
  });

  it("getCheckoutStatus GETs the status route", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, statusBody));
    await getCheckoutStatus(TX);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://paykit.example/api/v1/checkout/${TX}`);
    expect(init.method).toBe("GET");
  });

  it("surfaces a 404 as ok:false", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "Not found" }));
    const res = await claimCheckout(TX);
    expect(res).toEqual({ ok: false, status: 404, error: "Not found" });
  });
});
