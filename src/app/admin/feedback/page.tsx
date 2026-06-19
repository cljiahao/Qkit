import { Star } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const revalidate = 0;

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  const { data: rows } = await supabase
    .from("feedback")
    .select("id, source, rating, message, order_number, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const feedback = rows ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Feedback
        </h1>
      </div>

      {feedback.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No feedback yet. Customers see a prompt on the order-status page;
          vendors can send it from their dashboard.
        </p>
      ) : (
        <div className="space-y-3">
          {feedback.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
                      f.source === "vendor"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {f.source}
                  </span>
                  {f.rating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "size-3.5",
                            i < f.rating!
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30",
                          )}
                        />
                      ))}
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {f.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </div>
              {f.message && <p className="mt-2 text-sm">{f.message}</p>}
              {f.order_number && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  order #{f.order_number}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
