// Decorative hero visual: a miniature "live order board" so visitors see what
// QKit does in a glance. Pure presentational — sample data, no props.

const TICKETS = [
  {
    n: "0042",
    name: "Ada",
    item: "2× Kopi · Iced",
    status: "preparing" as const,
  },
  { n: "0041", name: "Wei", item: "1× Milo · Hot", status: "ready" as const },
  {
    n: "0040",
    name: "Sam",
    item: "3× Teh · Less sugar",
    status: "preparing" as const,
  },
];

const STATUS_LABEL = { preparing: "Preparing", ready: "Ready" } as const;

export function LandingBoardPreview() {
  return (
    <div
      aria-hidden
      className="ticket relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_24px_48px_-32px_oklch(0.4_0.06_45/0.45)]"
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live orders
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          2 active
        </span>
      </div>

      <div className="space-y-2.5">
        {TICKETS.map((t) => (
          <div
            key={t.n}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold">#{t.n}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.name} · {t.item}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold"
              style={{
                color: `var(--color-status-${t.status})`,
                backgroundColor: `color-mix(in oklch, var(--color-status-${t.status}) 14%, transparent)`,
              }}
            >
              {STATUS_LABEL[t.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
