"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortDateTime } from "@/lib/tz";
import type { BoothReviews, ReviewSummary } from "@/lib/reviews";

const PAGE = 5;

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i < value
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

function Distribution({ summary }: { summary: ReviewSummary }) {
  const { count, distribution } = summary;
  if (count === 0) return null;
  return (
    <div className="space-y-1">
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const n = distribution[star];
        const pct = Math.round((n / count) * 100);
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-muted-foreground">{star}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function BoothGroup({ group }: { group: BoothReviews }) {
  const { boothName, summary } = group;
  const [shown, setShown] = useState(PAGE);
  const comments = summary.recent.filter((r) => r.message?.trim());
  const visible = comments.slice(0, shown);

  return (
    <div className="space-y-3 border-t border-border/60 pt-4 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-medium">{boothName}</p>
        <span className="flex shrink-0 items-center gap-1.5 text-sm">
          <span className="font-semibold">
            {summary.average?.toFixed(1) ?? "—"}
          </span>
          <Stars value={Math.round(summary.average ?? 0)} />
          <span className="text-muted-foreground">({summary.count})</span>
        </span>
      </div>

      <Distribution summary={summary} />

      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((r, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-background p-3 text-sm"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                {r.rating != null ? <Stars value={r.rating} /> : <span />}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {shortDateTime(r.created_at)}
                </span>
              </div>
              {r.message && <p className="whitespace-pre-line">{r.message}</p>}
            </li>
          ))}
        </ul>
      )}

      {shown < comments.length && (
        <button
          type="button"
          onClick={() => setShown((s) => s + PAGE)}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          Show more ({comments.length - shown})
        </button>
      )}
    </div>
  );
}

/**
 * Customer reviews split per booth (so a vendor knows which booth each is for),
 * with timestamps and per-booth "show more" paging. Always visible — a vendor's
 * reputation isn't gated.
 */
export function ReviewsCard({ groups }: { groups: BoothReviews[] }) {
  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Customer reviews
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customer feedback yet. Customers get a prompt after each order.
        </p>
      ) : (
        groups.map((g) => <BoothGroup key={g.boothId} group={g} />)
      )}
    </section>
  );
}
