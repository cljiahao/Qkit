import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOrderItems } from "@/lib/schemas";
import type { StatsOrder } from "@/lib/stats";
import type { ReviewRow } from "@/lib/reviews";
import type { Database } from "@/lib/types";

/** Fetch this vendor's orders for a window [gte, lt). RLS scopes to the vendor. */
export async function fetchOrders(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
  gte: string,
  lt?: string,
): Promise<StatsOrder[]> {
  if (!boothIds.length) return [];
  let query = supabase
    .from("orders")
    .select("status, total_cents, items, created_at, ready_at, payment_status")
    .in("booth_id", boothIds)
    .gte("created_at", gte);
  if (lt) query = query.lt("created_at", lt);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    status: row.status,
    total_cents: row.total_cents,
    items: parseOrderItems(row.items),
    created_at: row.created_at,
    ready_at: row.ready_at,
    payment_status: row.payment_status,
  }));
}

/**
 * Lifetime totals across the vendor's booths — order count and revenue earned,
 * non-cancelled (`status <> 'cancelled'`, so completed and in-flight both
 * count). Deliberately NOT range- or booth-filtered: it's the "since you
 * started, every booth" number, kept separate from the range KPIs. Selects just
 * `total_cents` and reduces in-process (count = row count) so there's no
 * dependency on a PostgREST aggregate. RLS scopes rows to this vendor.
 */
export async function fetchAllTimeTotals(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
): Promise<{ orders: number; revenue_cents: number }> {
  if (!boothIds.length) return { orders: 0, revenue_cents: 0 };
  const { data } = await supabase
    .from("orders")
    .select("total_cents")
    .in("booth_id", boothIds)
    .neq("status", "cancelled");
  const rows = data ?? [];
  return {
    orders: rows.length,
    revenue_cents: rows.reduce((sum, r) => sum + r.total_cents, 0),
  };
}

/**
 * All customer reviews for this vendor's booths, newest first. RLS
 * (feedback_vendor_read_own) already restricts rows to booths this vendor owns;
 * the explicit `.in("booth_id", …)` lets Postgres use the feedback(booth_id,
 * created_at) index instead of scanning platform-wide feedback to apply the RLS
 * membership filter per row, and keeps the 500-row cap on THIS vendor's reviews.
 */
export async function fetchReviewRows(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
): Promise<ReviewRow[]> {
  if (!boothIds.length) return [];
  const { data } = await supabase
    .from("feedback")
    .select("rating, message, order_number, booth_id, created_at")
    .eq("source", "customer")
    .in("booth_id", boothIds)
    .order("created_at", { ascending: false })
    .limit(500);
  // No cast: the select column list matches the generated `feedback` Row, so the
  // typed client already infers ReviewRow[] — parse-don't-cast holds by inference.
  return data ?? [];
}

/**
 * Reviews for orders PLACED within [from, to) — keyed by the order's date, not
 * the review's. A customer who reviews days late (after the event has ended)
 * still counts toward that event, because the order belongs to it.
 */
export async function fetchEventReviewRows(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
  from: string,
  to: string,
): Promise<ReviewRow[]> {
  if (!boothIds.length) return [];
  // Neither query depends on the other's result — both only need boothIds —
  // so run them concurrently instead of paying two sequential round-trips.
  const [{ data: orderKeys }, rows] = await Promise.all([
    supabase
      .from("orders")
      .select("booth_id, order_number")
      .in("booth_id", boothIds)
      .gte("created_at", from)
      .lt("created_at", to),
    fetchReviewRows(supabase, boothIds),
  ]);
  const inEvent = new Set(
    (orderKeys ?? []).map((o) => `${o.booth_id}::${o.order_number}`),
  );
  if (inEvent.size === 0) return [];
  return rows.filter(
    (r) => r.order_number && inEvent.has(`${r.booth_id}::${r.order_number}`),
  );
}
