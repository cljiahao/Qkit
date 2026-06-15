import { NextResponse } from "next/server";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseOrderItems } from "@/lib/schemas";
import { computeStats, type StatsOrder } from "@/lib/stats";
import { allowedStatsRanges, normalizePlan } from "@/lib/plan";
import { toSalesSummaryV1 } from "@/lib/sales-summary";
import { MS_PER_DAY } from "@/lib/utils";

// Read-only sales summary, v1 of the external contract (see lib/sales-summary).
// AUTH: currently the vendor's Supabase session (cookie) — so it serves the
// vendor's own browser / same-origin callers, and RLS scopes every row. Machine
// auth (per-vendor API keys) for cross-product (sibling -kit) access is a
// deliberate FUTURE step — designed around the real consumer, not pre-built.
// The response SHAPE is frozen now so that integration won't require a rewrite.

const RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function GET(request: Request) {
  const { user, vendor } = await getVendor();
  if (!user || !vendor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = normalizePlan(vendor.plan);
  const allowed = allowedStatsRanges(plan);
  const params = new URL(request.url).searchParams;
  const requested = params.get("range") ?? "7d";
  const range = allowed.includes(requested)
    ? requested
    : (allowed.at(-1) ?? "24h");
  const days = RANGE_DAYS[range] ?? 1;
  const generatedAt = new Date().toISOString();
  const cutoff = new Date(
    Date.parse(generatedAt) - days * MS_PER_DAY,
  ).toISOString();

  const supabase = await createServerClient();

  // Resolve booth filter against the vendor's own booths (RLS-scoped read).
  const { data: booths } = await supabase
    .from("booths")
    .select("id")
    .eq("vendor_id", vendor.id);
  const boothIds = (booths ?? []).map((b) => b.id);
  const boothParam = params.get("booth");
  const boothId =
    boothParam && boothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = boothId === "all" ? boothIds : [boothId];

  let orders: StatsOrder[] = [];
  if (queryIds.length) {
    const { data } = await supabase
      .from("orders")
      .select("status, total_cents, items, created_at")
      .in("booth_id", queryIds)
      .gte("created_at", cutoff);
    orders = (data ?? []).map((row) => ({
      status: row.status,
      total_cents: row.total_cents,
      items: parseOrderItems(row.items),
      created_at: row.created_at,
    }));
  }

  const summary = computeStats(orders);
  return NextResponse.json(
    toSalesSummaryV1(summary, { range, boothId, generatedAt }),
  );
}
