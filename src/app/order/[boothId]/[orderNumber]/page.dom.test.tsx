// @vitest-environment jsdom
//
// Follows the pattern established in src/app/dashboard/layout.dom.test.tsx:
// this repo has no convention for rendering a full async Server Component
// page through RTL, but page.tsx is a plain async function with no
// RSC-specific machinery, so it can be awaited directly and its returned
// element tree rendered like any other component. Every nested async
// server component (EarnLink) and every client component with its own
// side effects (OrderStatusPoller, PayPanel behind next/dynamic) is
// stubbed out here so the test stays focused on page.tsx's own gating of
// TelegramConnect — not on those components' own behavior, which each
// already has its own dedicated test file.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OrderStatus } from "@/lib/types";
import OrderStatusPage from "./page";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./order-status-poller", () => ({ OrderStatusPoller: () => null }));
vi.mock("./earn-link", () => ({ EarnLink: () => null }));
vi.mock("./telegram-connect", () => ({
  TelegramConnect: () => <div data-testid="telegram-connect" />,
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/paykit/client", () => ({
  createCheckout: vi.fn(),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "00000000-0000-4000-8000-000000000002";
const VENDOR_ID = "00000000-0000-4000-8000-000000000003";
const ORDER_NUMBER = "1";

function makeOrder(status: OrderStatus) {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    booth_id: BOOTH_ID,
    order_number: ORDER_NUMBER,
    access_token: TOKEN,
    status,
    payment_status: "not_required",
    customer_name: "Alex",
    items: [],
    total_cents: 0,
    created_at: "2026-08-16T00:00:00Z",
  };
}

const booth = {
  name: "Kopi Corner",
  vendor_id: VENDOR_ID,
  social_links: null,
};

const { maybeSingle, boothSingle, vendorMaybeSingle } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  boothSingle: vi.fn(),
  vendorMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        if (table === "orders")
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ eq: () => ({ maybeSingle }) }),
              }),
            }),
          };
        if (table === "booths")
          return {
            select: () => ({ eq: () => ({ single: boothSingle }) }),
          };
        if (table === "vendors")
          return {
            select: () => ({ eq: () => ({ maybeSingle: vendorMaybeSingle }) }),
          };
        throw new Error(`unexpected table ${table}`);
      },
    }),
}));

beforeEach(() => {
  maybeSingle.mockReset();
  boothSingle.mockReset().mockResolvedValue({ data: booth });
  // No board_settings row -> boardSettingsSchema fails -> resolveHeadingNumber
  // degrades to the real order_number without a second query.
  vendorMaybeSingle.mockReset().mockResolvedValue({ data: null });
});

async function renderPage(status: OrderStatus) {
  maybeSingle.mockResolvedValue({ data: makeOrder(status), error: null });
  const jsx = await OrderStatusPage({
    params: Promise.resolve({ boothId: BOOTH_ID, orderNumber: ORDER_NUMBER }),
    searchParams: Promise.resolve({ t: TOKEN }),
  });
  return render(jsx);
}

describe("OrderStatusPage — TelegramConnect gating", () => {
  it.each<OrderStatus>(["pending", "confirmed", "preparing"])(
    "renders TelegramConnect while status is %s",
    async (status) => {
      await renderPage(status);
      expect(screen.getByTestId("telegram-connect")).toBeInTheDocument();
    },
  );

  it.each<OrderStatus>(["ready", "completed", "cancelled"])(
    "does not render TelegramConnect once status is %s",
    async (status) => {
      await renderPage(status);
      expect(screen.queryByTestId("telegram-connect")).not.toBeInTheDocument();
    },
  );
});
