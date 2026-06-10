import { redirect } from "next/navigation";
import { getVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { parseOrderItems } from "@/lib/schemas";
import { computeStats, type StatsOrder } from "@/lib/stats";
import { StatsControls } from "./stats-controls";
import { StatsView } from "./stats-view";

export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };

interface Props {
  searchParams: Promise<{ range?: string; booth?: string }>;
}

export default async function StatsPage({ searchParams }: Props) {
  const { range: rangeParam, booth: boothParam } = await searchParams;
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const range = rangeParam && rangeParam in RANGE_DAYS ? rangeParam : "7d";
  const days = RANGE_DAYS[range];
  // Async server component renders once per request; reading the wall clock here
  // is intentional (the rolling-window cutoff). The purity rule targets client
  // render, not RSC data fetching.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

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
    }));
  }

  const summary = computeStats(orders);

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

      <StatsControls range={range} booth={selectedBooth} booths={boothList} />

      <StatsView summary={summary} />
    </div>
  );
}
