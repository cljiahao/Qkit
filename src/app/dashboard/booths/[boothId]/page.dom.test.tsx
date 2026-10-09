// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan";
const { gate, booth, from, filter, config, booking, form } = vi.hoisted(() => ({
  gate: vi.fn(),
  booth: { current: {} as Record<string, unknown> | null },
  from: vi.fn(),
  filter: vi.fn(),
  config: vi.fn(),
  booking: vi.fn(),
  form: vi.fn(),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  requireEntitledVendor: gate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
}));
vi.mock("@/lib/paykit/client", () => ({
  getVendorConfig: config,
  getBookingStatus: booking,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../booth-form", () => ({
  BoothForm: (props: unknown) => {
    form(props);
    return null;
  },
}));
import EditBoothPage from "./page";
const page = () =>
  EditBoothPage({ params: Promise.resolve({ boothId: "booth-a" }) });
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({
    vendor: { id: "vendor-a", social_links: {} },
    entitlement: ENTITLEMENTS.free,
  });
  booth.current = {
    id: "booth-a",
    name: "Coffee",
    menu_items: [],
    payment: null,
    hours: null,
    social_links: null,
    paykit_booking_id: null,
  };
  config.mockResolvedValue({ ok: false });
  booking.mockResolvedValue({ ok: false });
  from.mockReturnValue({
    select: () => ({
      eq: (column: string, value: string) => {
        filter(column, value);
        return { maybeSingle: async () => ({ data: booth.current }) };
      },
    }),
  });
});

describe("booth editor data boundary", () => {
  it("requires a vendor before fetching booth or payment configuration", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(page()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
    expect(config).not.toHaveBeenCalled();
  });
  it("does not fetch private payment configuration for an RLS-hidden booth", async () => {
    booth.current = null;
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(config).not.toHaveBeenCalled();
    expect(booking).not.toHaveBeenCalled();
  });
  it.each([
    [null, null],
    [{ kind: "paynow" }, { kind: "paynow", payee_name: "" }],
    [{ kind: "pointer" }, { kind: "pointer", label: "" }],
    [{ kind: "unknown" }, null],
  ])(
    "falls back to the local marker %j when Paykit is unavailable",
    async (payment, expected) => {
      booth.current = { ...booth.current, payment };
      render(await page());
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({
            payment: expected,
            bookingStatus: null,
            menuItemCount: 0,
          }),
        }),
      );
      expect(config).toHaveBeenCalledWith("vendor-a");
      expect(booking).not.toHaveBeenCalled();
      expect(filter).toHaveBeenCalledWith("id", "booth-a");
    },
  );
  it.each([
    [
      {
        kind: "paynow",
        payeeName: "Coffee",
        uen: "123456789A",
        mobile: "+6581234567",
      },
      {
        kind: "paynow",
        payee_name: "Coffee",
        uen: "123456789A",
        mobile: "+6581234567",
      },
    ],
    [{ kind: "paynow" }, { kind: "paynow", payee_name: "" }],
    [
      {
        kind: "pointer",
        label: "Pay here",
        url: "https://pay.example",
        qrImageUrl: "https://pay.example/qr.png",
      },
      {
        kind: "pointer",
        label: "Pay here",
        url: "https://pay.example",
        qr_image_url: "https://pay.example/qr.png",
      },
    ],
    [{ kind: "pointer" }, { kind: "pointer", label: "" }],
    [{ kind: "unknown" }, null],
    [{ hasConfig: false }, null],
  ])("prefills supported remote configuration %j", async (data, payment) => {
    booth.current = {
      ...booth.current,
      payment: payment ? { kind: payment.kind } : null,
    };
    config.mockResolvedValue({ ok: true, data: { hasConfig: true, ...data } });
    render(await page());
    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: expect.objectContaining({ payment }),
        savedPayment: payment,
      }),
    );
  });
  it.each(["paynow", "pointer"])(
    "does not enable booth payment merely because vendor configuration is %s",
    async (kind) => {
      config.mockResolvedValue({ ok: true, data: { hasConfig: true, kind } });
      render(await page());
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({ payment: null }),
          savedPayment:
            kind === "paynow" ? { kind, payee_name: "" } : { kind, label: "" },
        }),
      );
    },
  );
  it.each([true, false])(
    "shows booking status only when its lookup succeeds: %s",
    async (ok) => {
      booth.current = {
        ...booth.current,
        paykit_booking_id: "booking-a",
        social_links: {},
      };
      booking.mockResolvedValue({
        ok,
        data: { id: "booking-a", status: "confirmed" },
      });
      render(await page());
      expect(booking).toHaveBeenCalledWith("booking-a");
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({
            bookingStatus: ok ? { id: "booking-a", status: "confirmed" } : null,
          }),
        }),
      );
    },
  );
});
