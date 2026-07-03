// Decorative hero visual, queue-only variant: a miniature "live order board" for
// a booth that does not charge or cost per item (an ice-cream cart). Same ticket
// look as LandingBoardPreview (perforation, mono #number, status pill, itemized
// lines, Mark-Ready action) but with NO prices and NO total row, so visitors see
// that QKit runs booths that only need a queue, not a till.

const TICKETS = [
  {
    n: "0089",
    name: "Sam",
    status: "preparing" as const,
    lines: [
      { q: 2, name: "Sea-salt Gelato", opt: "Extra scoop" },
      { q: 1, name: "Milo Sundae", opt: "Extra Milo dust" },
    ],
    action: "Mark Ready",
  },
  {
    n: "0088",
    name: "Nadia",
    status: "ready" as const,
    lines: [{ q: 1, name: "Matcha Cone", opt: "Waffle cone" }],
    action: "Mark Picked Up",
  },
];

const STATUS_LABEL = { preparing: "Preparing", ready: "Ready" } as const;

export function LandingOrderPreviewIcecream() {
  return (
    <div
      aria-hidden
      className="ticket relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_24px_48px_-32px_oklch(0.4_0.06_45/0.45)]"
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live orders
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6rem] tracking-normal text-primary">
            Queue only
          </span>
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

            <div className="space-y-1.5 px-3 py-2.5">
              {t.lines.map((l, i) => (
                <div key={i} className="text-xs">
                  <span className="truncate">
                    <span className="font-mono text-muted-foreground">
                      {l.q}×
                    </span>{" "}
                    {l.name}
                  </span>
                  <p className="truncate pl-4 text-[0.7rem] text-muted-foreground">
                    {l.opt}
                  </p>
                </div>
              ))}
            </div>

            <div className="perforation mx-3" />

            <div className="px-3 pb-3 pt-2">
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
