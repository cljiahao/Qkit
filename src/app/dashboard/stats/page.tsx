import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseOrderItems } from "@/lib/schemas";
import { computeStats, pctChange, type StatsOrder } from "@/lib/stats";
import { allowedStatsRanges, normalizePlan } from "@/lib/plan";
import { MS_PER_DAY } from "@/lib/utils";
import type { Database } from "@/lib/types";
import { StatsControls } from "./stats-controls";
import { StatsView } from "./stats-view";

export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface Props {
  searchParams: Promise<{ range?: string; booth?: string }>;
}

/** Fetch this vendor's orders for a window [gte, lt). RLS scopes to the vendor. */
async function fetchOrders(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
  gte: string,
  lt?: string,
): Promise<StatsOrder[]> {
  if (!boothIds.length) return [];
  let query = supabase
    .from("orders")
    .select("status, total_cents, items, created_at")
    .in("booth_id", boothIds)
    .gte("created_at", gte);
  if (lt) query = query.lt("created_at", lt);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    status: row.status,
    total_cents: row.total_cents,
    items: parseOrderItems(row.items),
    created_at: row.created_at,
  }));
}

export default async function StatsPage({ searchParams }: Props) {
  const { range: rangeParam, booth: boothParam } = await searchParams;
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  // Plan gate: free vendors see today only. Clamp an out-of-plan (or unknown)
  // range to the widest the plan allows.
  const plan = normalizePlan(vendor.plan);
  const pro = plan === "pro";
  const allowedRanges = allowedStatsRanges(plan);
  const requested = rangeParam && rangeParam in RANGE_DAYS ? rangeParam : "7d";
  const range = allowedRanges.includes(requested)
    ? requested
    : (allowedRanges.at(-1) ?? "24h");
  const days = RANGE_DAYS[range];
  // Async server component renders once per request; reading the wall clock here
  // is intentional (the rolling-window cutoff). The purity rule targets client
  // render, not RSC data fetching.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cutoff = new Date(now - days * MS_PER_DAY).toISOString();

  const supabase = await createServerClient();

  // Vendor's booths for the filter dropdown. RLS scopes to this vendor.
  const { data: booths } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const boothList = booths ?? [];
  const boothIds = boothList.map((b) => b.id);

  // Only honor a booth filter that belongs to this vendor; else aggregate all.
  const selectedBooth =
    boothParam && boothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = selectedBooth === "all" ? boothIds : [selectedBooth];

  const summary = computeStats(await fetchOrders(supabase, queryIds, cutoff));

  // Period comparison (Pro): same metrics over the immediately prior window.
  let deltas: {
    revenue: number | null;
    orders: number | null;
    aov: number | null;
  } | null = null;
  if (pro && queryIds.length) {
    const priorCutoff = new Date(now - 2 * days * MS_PER_DAY).toISOString();
    const prior = computeStats(
      await fetchOrders(supabase, queryIds, priorCutoff, cutoff),
    );
    deltas = {
      revenue: pctChange(summary.revenue_cents, prior.revenue_cents),
      orders: pctChange(summary.orderCount, prior.orderCount),
      aov: pctChange(summary.aov_cents, prior.aov_cents),
    };
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Performance
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Stats
        </h1>
      </div>

      <StatsControls
        range={range}
        booth={selectedBooth}
        booths={boothList}
        allowedRanges={allowedRanges}
      />

      <StatsView summary={summary} deltas={deltas} pro={pro} />
    </div>
  );
}
