// @vitest-environment jsdom
//
// This repo has no existing pattern for rendering a full async Server
// Component page/layout through RTL (every other *.test.ts(x) under
// src/app tests a server action or lib function in isolation, never a
// layout's/page's own JSX output). DashboardLayout is a plain async
// function with no RSC-specific machinery of its own — its "use server"
// signOut closure is never invoked here — so it can be awaited directly
// like any other function and its returned element tree rendered via RTL,
// same as any client component. That's what lets this test catch a
// regression a suite built only around `<DashboardNav>` in isolation
// cannot: dashboard-nav.dom.test.tsx renders DashboardNav standalone, so
// it never sees layout.tsx's own wrapper markup around it — exactly the
// case where a duplicate <header> (layout.tsx's old wrapper + @merqo/ui's
// DashboardNav rendering its own <header> internally) slipped through.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan";
import DashboardLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { signOut: vi.fn() },
  })),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: vi.fn(async () => ({
    user: { id: "v1", user_metadata: {} },
    vendor: { name: "Kopi Corner", tour_seen_at: "2026-01-01T00:00:00Z" },
    entitlement: ENTITLEMENTS.free,
  })),
}));
vi.mock("@/lib/admin", () => ({
  isAdmin: vi.fn(async () => false),
}));
// The legal-acceptance gate has its own suite (legal-gate.test.ts); stubbed
// here so this test stays focused on layout.tsx's header composition and
// doesn't reach for a real service-role client.
vi.mock("@/lib/legal-gate", () => ({
  requireCurrentLegalAcceptance: vi.fn(async () => {}),
}));
// The onboarding tour's own auto-run/driver.js behavior is covered by
// dashboard-tour.dom.test.tsx; stubbed here so this test stays focused on
// layout.tsx's header composition.
vi.mock("@/components/dashboard-tour", () => ({
  DashboardTour: () => null,
}));

describe("DashboardLayout", () => {
  it("renders exactly one <header> landmark (@merqo/ui's DashboardNav owns it — layout.tsx must not wrap it in its own)", async () => {
    const jsx = await DashboardLayout({ children: <div>page content</div> });
    const { container } = render(jsx);

    expect(container.querySelectorAll("header")).toHaveLength(1);
  });

  // jsdom doesn't compute layout/positioning, so it can't directly prove the
  // header actually sticks on scroll. What it CAN prove is the structural
  // precondition that makes sticky positioning work: the header's immediate
  // wrapper must be `display: contents` so the wrapper's own box doesn't
  // become the header's `position: sticky` containing block (a plain div
  // wrapper — no `contents` — would be exactly the header's height, leaving
  // the sticky header no room to move and silently breaking it; see the
  // comment in layout.tsx above this wrapper for the full explanation).
  it("wraps the header in a display:contents div, not a plain div, so sticky positioning has room to work", async () => {
    const jsx = await DashboardLayout({ children: <div>page content</div> });
    const { container } = render(jsx);

    const header = container.querySelector("header");
    expect(header?.parentElement).toHaveClass("contents", "print:hidden");
  });
});
