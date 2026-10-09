import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import {
  fetchAllTimeTotals,
  fetchOrders,
  fetchEventReviewRows,
} from "./queries";

function database(rows: Record<string, unknown>[], failAfter?: number) {
  let start = 0;
  let boothIds: string[] = [];
  const query = {
    select: vi.fn(() => query),
    in: vi.fn((_column: string, ids: string[]) => {
      boothIds = ids;
      return query;
    }),
    eq: vi.fn(() => query),
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
            : rows
                .filter(
                  (row) =>
                    !row.booth_id || boothIds.includes(String(row.booth_id)),
                )
                .slice(start, start + 1000),
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
  it("batches large vendor booth filters without losing or double-counting orders", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `booth-${index}`);
    const { client, query } = database(
      ids.map((booth_id) => ({ booth_id, total_cents: 100 })),
    );
    await expect(fetchAllTimeTotals(client, [...ids, ids[0]])).resolves.toEqual(
      { orders: 201, revenue_cents: 20100 },
    );
    const batches = query.in.mock.calls.map((call) => call[1]);
    expect(batches.every((batch) => batch.length <= 100)).toBe(true);
    expect(new Set(batches.flat()).size).toBe(201);
  });
  it("includes an event review older than the most recent lifetime reviews", async () => {
    const reviews = Array.from({ length: 1201 }, (_, index) => ({
      booth_id: "booth",
      order_number: index === 1200 ? "event-order" : `other-${index}`,
      rating: 5,
      message: "Good",
      created_at: "2026-01-01",
    }));
    const feedback = database(reviews);
    const orders = database([
      { booth_id: "booth", order_number: "event-order" },
    ]);
    const client = {
      from: (table: string) => {
        const query = table === "orders" ? orders.query : feedback.query;
        return { ...query, eq: () => query };
      },
    } as unknown as SupabaseClient<Database>;
    const result = await fetchEventReviewRows(
      client,
      ["booth"],
      "2026-01-01",
      "2026-01-02",
    );
    expect(result).toHaveLength(1);
    expect(result[0].order_number).toBe("event-order");
  });
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
