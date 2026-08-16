import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  mintCustomerConnectToken,
  notifyCustomer,
} from "./merqo-customer-notify";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.MERQO_BASE_URL = "https://merqo.example";
  process.env.MERQO_CUSTOMER_SECRET = "test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("mintCustomerConnectToken", () => {
  it("posts the right body/headers and returns the parsed token+deep_link on 2xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "tok123",
            deep_link: "https://t.me/bot?start=tok123",
          }),
          { status: 200 },
        ),
      );

    const result = await mintCustomerConnectToken("v1", "qkit", "qkit:o1");

    expect(result).toEqual({
      token: "tok123",
      deep_link: "https://t.me/bot?start=tok123",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://merqo.example/api/merqo/customer-connect-token");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      vendor_id: "v1",
      kit_slug: "qkit",
      notify_ref: "qkit:o1",
    });
  });

  it("returns null on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 401 }),
    );
    const result = await mintCustomerConnectToken("v1", "qkit", "qkit:o1");
    expect(result).toBeNull();
  });

  it("returns null on a timeout/network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const result = await mintCustomerConnectToken("v1", "qkit", "qkit:o1");
    expect(result).toBeNull();
  });
});

describe("notifyCustomer", () => {
  it("posts the right body/headers on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, sent: true }), { status: 200 }),
      );

    await notifyCustomer("v1", "qkit:o1", "Your order is ready for pickup!");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://merqo.example/api/merqo/notify-customer");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      vendor_id: "v1",
      notify_ref: "qkit:o1",
      message: "Your order is ready for pickup!",
    });
  });

  it("never throws on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
    );
    await expect(
      notifyCustomer("v1", "qkit:o1", "hi"),
    ).resolves.toBeUndefined();
  });

  it("never throws on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    await expect(
      notifyCustomer("v1", "qkit:o1", "hi"),
    ).resolves.toBeUndefined();
  });
});
