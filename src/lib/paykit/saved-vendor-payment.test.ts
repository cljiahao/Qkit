import { describe, expect, it, vi, beforeEach } from "vitest";
import { savedVendorPayment } from "./saved-vendor-payment";

const { getVendorConfig } = vi.hoisted(() => ({ getVendorConfig: vi.fn() }));
vi.mock("./client", () => ({ getVendorConfig }));

const EMPTY = {
  hasConfig: true,
  displayName: null,
  kind: null,
  payeeName: null,
  uen: null,
  mobile: null,
  label: null,
  url: null,
  qrImageUrl: null,
};

beforeEach(() => {
  getVendorConfig.mockReset();
});

describe("savedVendorPayment", () => {
  it("maps a PayNow config, keeping only the proxy that is set", async () => {
    getVendorConfig.mockResolvedValue({
      ok: true,
      data: {
        ...EMPTY,
        kind: "paynow",
        payeeName: "Cart",
        mobile: "+6591234567",
      },
    });
    expect(await savedVendorPayment("v1")).toEqual({
      kind: "paynow",
      payee_name: "Cart",
      mobile: "+6591234567",
    });
    expect(getVendorConfig).toHaveBeenCalledWith("v1");
  });

  it("maps a PayNow UEN config", async () => {
    getVendorConfig.mockResolvedValue({
      ok: true,
      data: { ...EMPTY, kind: "paynow", payeeName: "Cart", uen: "53312345A" },
    });
    expect(await savedVendorPayment("v1")).toEqual({
      kind: "paynow",
      payee_name: "Cart",
      uen: "53312345A",
    });
  });

  it("maps a payment-link config", async () => {
    getVendorConfig.mockResolvedValue({
      ok: true,
      data: {
        ...EMPTY,
        kind: "pointer",
        label: "Pay",
        url: "https://pay.example",
      },
    });
    expect(await savedVendorPayment("v1")).toEqual({
      kind: "pointer",
      label: "Pay",
      url: "https://pay.example",
    });
  });

  it("maps a QR-image config", async () => {
    getVendorConfig.mockResolvedValue({
      ok: true,
      data: {
        ...EMPTY,
        kind: "pointer",
        qrImageUrl: "https://img.example/qr.webp",
      },
    });
    expect(await savedVendorPayment("v1")).toEqual({
      kind: "pointer",
      label: "",
      qr_image_url: "https://img.example/qr.webp",
    });
  });

  it("returns null when the vendor has nothing saved", async () => {
    getVendorConfig.mockResolvedValue({
      ok: true,
      data: { ...EMPTY, hasConfig: false },
    });
    expect(await savedVendorPayment("v1")).toBeNull();
  });

  it("returns null for a config of no known kind", async () => {
    getVendorConfig.mockResolvedValue({ ok: true, data: EMPTY });
    expect(await savedVendorPayment("v1")).toBeNull();
  });

  it("returns null when paykit cannot be reached", async () => {
    getVendorConfig.mockResolvedValue({
      ok: false,
      status: null,
      error: "unreachable",
    });
    expect(await savedVendorPayment("v1")).toBeNull();
  });
});
