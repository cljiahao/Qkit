import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewSummary } from "@/lib/reviews";

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

/**
 * What customers think of this vendor's booths — average, distribution, and
 * recent comments. Always visible (a vendor's reputation isn't gated).
 */
export function ReviewsCard({ summary }: { summary: ReviewSummary }) {
  const { count, average, distribution, recent } = summary;
  const comments = recent.filter((r) => r.message?.trim());

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Customer reviews
      </h2>

      {count === 0 && comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customer feedback yet. Customers get a prompt after each order.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="font-display text-4xl font-semibold leading-none">
              {average?.toFixed(1) ?? "—"}
            </span>
            <div>
              <Stars value={Math.round(average ?? 0)} />
              <p className="text-xs text-muted-foreground">
                {count} rating{count === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {count > 0 && (
            <div className="space-y-1">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const n = distribution[star];
                const pct = count ? Math.round((n / count) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-muted-foreground">{star}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-muted-foreground">
                      {n}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {comments.length > 0 && (
            <ul className="space-y-2">
              {comments.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-background p-3 text-sm"
                >
                  {r.rating != null && (
                    <div className="mb-1">
                      <Stars value={r.rating} />
                    </div>
                  )}
                  <p className="whitespace-pre-line">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
