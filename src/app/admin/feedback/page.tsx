import { Star } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { npsBreakdown } from "@/lib/nps";

export const revalidate = 0;

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  const { data: rows } = await supabase
    .from("feedback")
    .select("id, source, rating, nps, message, order_number, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const all = rows ?? [];
  const vendorRows = all.filter((f) => f.source === "vendor");
  const customerRows = all.filter((f) => f.source === "customer");
  const nps = npsBreakdown(
    vendorRows.map((f) => f.nps).filter((n): n is number => n != null),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-5 py-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Feedback
        </h1>
      </div>

      {/* ── QKit product feedback (vendor → us): NPS ──────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          QKit feedback · vendors
        </h2>
        <div className="flex flex-wrap items-end gap-6 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-display text-5xl font-semibold leading-none">
              {nps.score ?? "—"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              NPS · {nps.total} response{nps.total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-600">{nps.promoters} promoters</span>
            <span className="text-muted-foreground">
              {nps.passives} passive
            </span>
            <span className="text-status-cancelled">
              {nps.detractors} detractors
            </span>
          </div>
        </div>
        {vendorRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No vendor feedback yet. Vendors are prompted on /dashboard/feedback.
          </p>
        ) : (
          <div className="space-y-2">
            {vendorRows.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  {f.nps != null && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      NPS {f.nps}
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {when(f.created_at)}
                  </span>
                </div>
                {f.message && <p className="mt-2 text-sm">{f.message}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Customer order feedback (customer → vendor) ───────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Customer order feedback
        </h2>
        {customerRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No customer feedback yet. Customers see a prompt on the order-status
            page.
          </p>
        ) : (
          <div className="space-y-2">
            {customerRows.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
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
                  <span className="font-mono text-xs text-muted-foreground">
                    {when(f.created_at)}
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
      </section>
    </div>
  );
}
