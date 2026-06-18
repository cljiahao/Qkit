// Decorative hero visual: a miniature "live order board" so visitors see what
// QKit does at a glance. Pure presentational — sample data, no props. Mirrors
// the real OrderCard (ticket + perforation, mono #number, itemized lines,
// total, and the Mark-Ready action) so the hero matches the actual product.

const TICKETS = [
  {
    n: "0042",
    name: "Ada",
    status: "preparing" as const,
    lines: [{ q: 2, name: "Kopi", opt: "Iced", price: "$3.60" }],
    total: "$3.60",
    action: "Mark Ready",
  },
  {
    n: "0041",
    name: "Wei",
    status: "ready" as const,
    lines: [
      { q: 1, name: "Milo", opt: "Hot", price: "$2.20" },
      { q: 3, name: "Teh", opt: "Less sugar", price: "$5.40" },
    ],
    total: "$7.60",
    action: "Mark Picked Up",
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TICKETS.map((t) => (
          <div
            key={t.n}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-background/60"
          >
            <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
              <div className="min-w-0">
                <p className="font-mono text-lg font-bold leading-none">
                  #{t.n}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {t.name}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
                style={{
                  color: `var(--color-status-${t.status})`,
                  backgroundColor: `color-mix(in oklch, var(--color-status-${t.status}) 14%, transparent)`,
                }}
              >
                {STATUS_LABEL[t.status]}
              </span>
            </div>

            <div className="perforation mx-3" />

            <div className="space-y-1 px-3 py-2">
              {t.lines.map((l, i) => (
                <div key={i} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono text-muted-foreground">
                        {l.q}×
                      </span>{" "}
                      {l.name}
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {l.price}
                    </span>
                  </div>
                  <p className="truncate pl-4 text-[0.7rem] text-muted-foreground">
                    {l.opt}
                  </p>
                </div>
              ))}
            </div>

            <div className="perforation mx-3" />
            <div className="flex items-baseline justify-between px-3 py-2">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="font-mono text-sm font-bold">{t.total}</span>
            </div>

            <div className="px-3 pb-3">
              <span className="block rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
                {t.action}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
