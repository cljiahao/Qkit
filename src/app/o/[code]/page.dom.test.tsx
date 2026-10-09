// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
const { rpc, form, expired, recent } = vi.hoisted(() => ({
  rpc: vi.fn(),
  form: vi.fn(),
  expired: vi.fn(),
  recent: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}));
vi.mock("@/components/order/order-form", () => ({
  OrderForm: (props: unknown) => {
    form(props);
    return null;
  },
}));
vi.mock("@/components/order/recent-orders", () => ({
  RecentOrders: (props: unknown) => {
    recent(props);
    return null;
  },
}));
vi.mock("@/components/order/expired-code", () => ({
  ExpiredCode: (props: unknown) => {
    expired(props);
    return <p>Unavailable QR</p>;
  },
}));
vi.mock("@/components/media-image", () => ({
  MediaImage: () => <span>Booth image</span>,
}));
import OrderEntryPage from "./page";
const entry = () =>
  OrderEntryPage({ params: Promise.resolve({ code: "qr-code" }) });
const booth = {
  booth_id: "a",
  name: "Coffee",
  image_url: null,
  hours: null,
  is_active: true,
  servable: true,
  menu_items: [],
  menu_categories: [],
  remaining: {},
  social_links: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  rpc
    .mockResolvedValueOnce({ data: booth, error: null })
    .mockResolvedValue({ data: null, error: null });
});
describe("public QR entry", () => {
  it("keeps the menu available when the optional cup count request rejects", async () => {
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: booth, error: null })
      .mockRejectedValueOnce(new Error("Offline"));
    render(await entry());
    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({ closed: false }),
    );
    expect(expired).not.toHaveBeenCalled();
  });
  it("uses the sanitized ordering RPC and scopes recent orders to the booth", async () => {
    render(await entry());
    expect(rpc).toHaveBeenNthCalledWith(1, "get_booth_for_order", {
      p_short_code: "qr-code",
    });
    expect(recent).toHaveBeenCalledWith({ boothId: "a" });
    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({ code: "qr-code", boothId: "a", closed: false }),
    );
    expect(screen.getByRole("heading", { name: "Coffee" })).toBeInTheDocument();
  });
  it("distinguishes a transient RPC error from an expired code", async () => {
    rpc
      .mockReset()
      .mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(await entry());
    expect(expired).toHaveBeenCalledWith({ variant: "error" });
    expect(form).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...booth, name: 12 }])(
    "blocks invalid RPC projections %j",
    async (data) => {
      rpc.mockReset().mockResolvedValue({ data, error: null });
      render(await entry());
      expect(expired).toHaveBeenCalledWith({});
      expect(form).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([1, 10, 11, null, "invalid"])(
    "only shows useful low-stock counts: %s",
    async (data) => {
      rpc
        .mockReset()
        .mockResolvedValueOnce({ data: booth, error: null })
        .mockResolvedValue({ data, error: null });
      render(await entry());
      if (data === 1 || data === 10)
        expect(
          screen.getByText(
            `Only ${data} ${data === 1 ? "cup" : "cups"} left today`,
          ),
        ).toBeInTheDocument();
      else
        expect(
          screen.queryByText(/Only .* left today/),
        ).not.toBeInTheDocument();
    },
  );
  it("does not block browsing when decorative stock lookup fails", async () => {
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: booth, error: null })
      .mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(await entry());
    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({ closed: false }),
    );
  });
  it.each([
    [{ ...booth, is_active: false }, null, "Closed right now"],
    [{ ...booth, servable: false }, null, "Not taking orders"],
    [{ ...booth, servable: false }, 0, "Sold out for today"],
  ])("prioritizes the precise closure reason", async (data, cups, title) => {
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data, error: null })
      .mockResolvedValue({ data: cups, error: null });
    render(await entry());
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({ closed: true }),
    );
  });
  it("shows the vendor's image and contact links when paused", async () => {
    rpc
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          ...booth,
          is_active: false,
          image_url: "https://images.example/booth.jpg",
          social_links: { website: "https://coffee.example" },
        },
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    render(await entry());
    expect(screen.getByText("Booth image")).toBeInTheDocument();
    expect(screen.getByText("Reach Coffee here")).toBeInTheDocument();
  });
});
