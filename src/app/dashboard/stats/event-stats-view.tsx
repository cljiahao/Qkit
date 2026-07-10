import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { computeStats, windowSeries } from "@/lib/stats";
import { MS_PER_DAY, MS_PER_HOUR } from "@/lib/utils";
import { shortDay } from "@/lib/tz";
import { eventLabel, type EventLicense } from "@/lib/events";
import { groupReviewsByBooth, summarizeReviews } from "@/lib/reviews";
import type { Database } from "@/lib/types";
import { fetchOrders, fetchEventReviewRows } from "./queries";
import { StatsView } from "./stats-view";
import { ReviewsCard } from "./reviews-card";

interface Props {
  supabase: SupabaseClient<Database>;
  activeEvent: EventLicense;
  boothList: { id: string; name: string }[];
  allBoothIds: string[];
}

/**
 * A paid event window's FULL stats, ungated (the vendor paid for this pass) —
 * the "revisit a past event" view, distinct from the live range/today view.
 */
export async function EventStatsView({
  supabase,
  activeEvent,
  boothList,
  allBoothIds,
}: Props) {
  const from = activeEvent.valid_from;
  const to = activeEvent.expires_at;
  const orders = await fetchOrders(supabase, allBoothIds, from, to);
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
  const eventRows = await fetchEventReviewRows(supabase, allBoothIds, from, to);
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
