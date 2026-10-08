import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { fetchAllTimeTotals, fetchOrders } from "./queries";

function database(rows: Record<string, unknown>[], failAfter?: number) {
  let start = 0;
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    neq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn((from: number) => {
      start = from;
      return query;
    }),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({
        data:
          failAfter !== undefined && start >= failAfter
            ? null
            : rows.slice(start, start + 1000),
        error:
          failAfter !== undefined && start >= failAfter
            ? { message: "database unavailable" }
            : null,
      }).then(resolve);
    },
  };
  return {
    client: { from: () => query } as unknown as SupabaseClient<Database>,
    query,
  };
}

describe("stats database row limits", () => {
  it("includes orders beyond the API row cap in lifetime totals", async () => {
    const { client } = database(
      Array.from({ length: 1201 }, () => ({ total_cents: 100 })),
    );
    await expect(fetchAllTimeTotals(client, ["booth"])).resolves.toEqual({
      orders: 1201,
      revenue_cents: 120100,
    });
  });

  it("includes orders beyond the API row cap in date-window statistics", async () => {
    const { client, query } = database(
      Array.from({ length: 1201 }, () => ({
        status: "completed",
        total_cents: 100,
        items: [],
        created_at: "2026-10-07T00:00:00Z",
        ready_at: null,
        payment_status: "confirmed",
      })),
    );
    expect(
      await fetchOrders(client, ["booth"], "2026-10-01", "2026-11-01"),
    ).toHaveLength(1201);
    expect(query.lt).toHaveBeenCalledWith("created_at", "2026-11-01");
  });

  it("does not present partial totals when a later page fails", async () => {
    const { client } = database(
      Array.from({ length: 1201 }, () => ({ total_cents: 100 })),
      1000,
    );
    await expect(fetchAllTimeTotals(client, ["booth"])).rejects.toThrow();
  });
});
