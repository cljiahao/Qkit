import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseOrderItems } from "@/lib/schemas";
import {
  computeStats,
  pctChange,
  windowSeries,
  avgWaitSeconds,
  waitSeries,
  peakThroughput,
  type SeriesPoint,
  type StatsOrder,
  type WaitPoint,
} from "@/lib/stats";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/utils";
import { shortDay } from "@/lib/tz";
import { eventLabel } from "@/lib/events";
import {
  groupReviewsByBooth,
  summarizeReviews,
  type ReviewRow,
} from "@/lib/reviews";
import type { Database } from "@/lib/types";
import { StatsControls } from "./stats-controls";
import { StatsView } from "./stats-view";
import { EventsPanel } from "./events-panel";
import { ReviewsCard } from "./reviews-card";

export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface Props {
  searchParams: Promise<{ range?: string; booth?: string; event?: string }>;
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
 * All customer reviews for this vendor's booths, newest first. RLS
 * (feedback_vendor_read_own) returns only feedback for booths this vendor owns.
 */
async function fetchReviewRows(
  supabase: SupabaseClient<Database>,
): Promise<ReviewRow[]> {
  const { data } = await supabase
    .from("feedback")
    .select("rating, message, order_number, booth_id, created_at")
    .eq("source", "customer")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as ReviewRow[];
}

/**
 * Reviews for orders PLACED within [from, to) — keyed by the order's date, not
 * the review's. A customer who reviews days late (after the event has ended)
 * still counts toward that event, because the order belongs to it.
 */
async function fetchEventReviewRows(
  supabase: SupabaseClient<Database>,
  boothIds: string[],
  from: string,
  to: string,
): Promise<ReviewRow[]> {
  if (!boothIds.length) return [];
  const { data: orderKeys } = await supabase
    .from("orders")
    .select("booth_id, order_number")
    .in("booth_id", boothIds)
    .gte("created_at", from)
    .lt("created_at", to);
  const inEvent = new Set(
    (orderKeys ?? []).map((o) => `${o.booth_id}::${o.order_number}`),
  );
  if (inEvent.size === 0) return [];
  const rows = await fetchReviewRows(supabase);
  return rows.filter(
    (r) => r.order_number && inEvent.has(`${r.booth_id}::${r.order_number}`),
  );
}

export default async function StatsPage({ searchParams }: Props) {
  const {
    range: rangeParam,
    booth: boothParam,
    event: eventParam,
  } = await searchParams;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabaseEarly = await createServerClient();

  // The vendor's booths (RLS-scoped). Needed for both the live view filter and
  // the per-event windows.
  const { data: boothsData } = await supabaseEarly
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });
  const boothList = boothsData ?? [];
  const allBoothIds = boothList.map((b) => b.id);

  // Paid passes double as named, permanently-viewable events.
  const { data: licenses } = await supabaseEarly
    .from("licenses")
    .select("id, label, valid_from, expires_at")
    .eq("vendor_id", vendor.id)
    .order("valid_from", { ascending: false });
  const events = licenses ?? [];

  // ── Per-event view: a paid window's FULL stats, ungated (they paid). ─────────
  const activeEvent = eventParam
    ? events.find((e) => e.id === eventParam)
    : undefined;
  if (activeEvent) {
    const from = activeEvent.valid_from;
    const to = activeEvent.expires_at;
    const orders = await fetchOrders(supabaseEarly, allBoothIds, from, to);
    const summary = computeStats(orders);
    const spanDays = Math.max(
      1,
      Math.ceil((Date.parse(to) - Date.parse(from)) / MS_PER_DAY),
    );
    // Sub-day event → hourly buckets; multi-day → one slot per day. Anchored to
    // the window end so the trend lines up with the event, not "now".
    const series = windowSeries(
      orders,
      Date.parse(to),
      spanDays === 1 ? 24 : spanDays,
      spanDays === 1 ? MS_PER_HOUR : MS_PER_DAY,
    );
    // Reviews for orders placed during this event — by order date, so late
    // reviews (written after the event ended) still belong to it.
    const eventRows = await fetchEventReviewRows(
      supabaseEarly,
      allBoothIds,
      from,
      to,
    );
    const eventGroups = groupReviewsByBooth(eventRows, boothList);
    const eventOverall = summarizeReviews(eventRows);
    return (
      <div className="space-y-7">
        <div>
          <Link
            href="/dashboard/stats"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> All stats
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Event · {shortDay(Date.parse(from))} – {shortDay(Date.parse(to))} ·
            always available
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            {eventLabel(activeEvent)}
          </h1>
        </div>
        {/* Paid window → full stats regardless of current plan. Hide the trend
            chart for an empty (zero-revenue) event. */}
        <StatsView
          summary={summary}
          deltas={null}
          series={summary.revenue_cents > 0 ? series : null}
          range="event"
          boothId="all"
          pro
        />

        <ReviewsCard
          groups={eventGroups}
          overall={eventOverall}
          selected="all"
          linkable={false}
        />
      </div>
    );
  }

  // Plan gate: free + pass see today only; longitudinal history is Pro. Clamp an
  // out-of-plan (or unknown) range to the widest the entitlement allows.
  const pro = entitlement.tier === "pro";
  const allowedRanges = entitlement.statsRanges;
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

  // Only honor a booth filter that belongs to this vendor; else aggregate all.
  const selectedBooth =
    boothParam && allBoothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = selectedBooth === "all" ? allBoothIds : [selectedBooth];

  const orders = await fetchOrders(supabaseEarly, queryIds, cutoff);
  const summary = computeStats(orders);
  const avgWait = avgWaitSeconds(orders);

  const reviewRows = await fetchReviewRows(supabaseEarly);
  const reviewGroups = groupReviewsByBooth(reviewRows, boothList);
  const reviewOverall = summarizeReviews(reviewRows);

  // Period comparison + trend are Pro-only.
  let deltas: {
    revenue: number | null;
    orders: number | null;
    aov: number | null;
  } | null = null;
  let series: SeriesPoint[] | null = null;
  let waitPoints: WaitPoint[] | null = null;
  let peak = 0;
  if (pro && queryIds.length) {
    const priorCutoff = new Date(now - 2 * days * MS_PER_DAY).toISOString();
    const prior = computeStats(
      await fetchOrders(supabaseEarly, queryIds, priorCutoff, cutoff),
    );
    deltas = {
      revenue: pctChange(summary.revenue_cents, prior.revenue_cents),
      orders: pctChange(summary.orderCount, prior.orderCount),
      aov: pctChange(summary.aov_cents, prior.aov_cents),
    };
    // 24h → 24 hourly slots; multi-day → one slot per day.
    const buckets = days === 1 ? 24 : days;
    const bucketMs = days === 1 ? MS_PER_HOUR : MS_PER_DAY;
    series = windowSeries(orders, now, buckets, bucketMs);
    waitPoints = waitSeries(orders, now, buckets, bucketMs);
    peak = peakThroughput(orders);
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

      <StatsView
        summary={summary}
        deltas={deltas}
        series={series}
        range={range}
        boothId={selectedBooth}
        pro={pro}
        speed={{
          avgWaitSeconds: avgWait,
          series: waitPoints,
          peakThroughput: peak,
        }}
      />

      <ReviewsCard
        groups={reviewGroups}
        overall={reviewOverall}
        selected={selectedBooth}
        range={range}
      />

      <EventsPanel events={events} />
    </div>
  );
}
