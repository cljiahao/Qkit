// src/lib/supabase/get-entitlement.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getOrCreateVendorProfile, getUser } = vi.hoisted(() => ({
  getOrCreateVendorProfile: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/merqo-vendor-profile", () => ({ getOrCreateVendorProfile }));
vi.mock("@/lib/supabase/get-user", () => ({ getUser }));

const maybeSingleVendor = vi.fn();
const maybeSingleLicense = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    from: (table: string) => {
      if (table === "vendors") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: maybeSingleVendor }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            lte: () => ({
              gt: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: maybeSingleLicense }),
                }),
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { loadEntitlement } from "./get-entitlement";

beforeEach(() => {
  getOrCreateVendorProfile.mockReset();
  getUser.mockReset();
  maybeSingleVendor.mockReset();
  maybeSingleLicense.mockReset();
  maybeSingleLicense.mockResolvedValue({ data: null });
});

describe("loadEntitlement", () => {
  it("merges the merqo profile's stall_name/social_links onto the vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({
      data: {
        id: "v1",
        plan: "free",
        created_at: "2026-01-01T00:00:00Z",
        tour_seen_at: null,
        board_settings: {
          aging_min: 5,
          overdue_min: 10,
          sound_id: "chime",
          desktop_notify: false,
          undo_seconds: 5,
          daily_order_number_reset: true,
          show_wait_estimate: true,
          default_prep_minutes: null,
          ready_auto_clear_min: null,
        },
      },
      error: null,
    });
    getOrCreateVendorProfile.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopitiam Cart",
      social_links: { website: "https://example.com" },
    });

    const { vendor } = await loadEntitlement();

    expect(vendor?.name).toBe("Kopitiam Cart");
    expect(vendor?.social_links).toEqual({ website: "https://example.com" });
    expect(getOrCreateVendorProfile).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      null,
    );
  });

  it("returns a null vendor without calling getOrCreateVendorProfile when there's no vendor row", async () => {
    getUser.mockResolvedValue({ id: "v1" });
    maybeSingleVendor.mockResolvedValue({ data: null, error: null });

    const { vendor } = await loadEntitlement();

    expect(vendor).toBeNull();
    expect(getOrCreateVendorProfile).not.toHaveBeenCalled();
  });
});
