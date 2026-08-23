import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPrintJob } from "./client";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("createPrintJob", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns ok:false when PRINTKIT_KIT_SECRET is unset", async () => {
    delete process.env.PRINTKIT_KIT_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when NEXT_PUBLIC_PRINTKIT_URL is unset (fails closed, never guesses a host)", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a qkit:secret bearer token and the correct payload shape", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "job-1" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({ ok: true, data: { id: "job-1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://printkit.test/api/v1/print-jobs");
    expect(init.headers.Authorization).toBe("Bearer qkit:s3cret");
    expect(JSON.parse(init.body)).toEqual({
      vendor_id: "vendor-1",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_ref: "order-1",
    });
  });

  it("collapses a non-2xx response to ok:false without throwing", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "A print job already exists for this order.",
        }),
    });

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });
  });

  it("collapses a network error to ok:false without throwing", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network down");
  });
});
