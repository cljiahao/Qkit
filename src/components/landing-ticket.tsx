// Presentational "order chit" for the landing hero carousel. Mirrors the real
// OrderCard's visual language (badge/wash/perforation) but takes a small,
// display-only data shape — no server actions, no state. The carousel root
// (not this component) carries aria-hidden since these are decorative.

import { cn } from "@/lib/utils";
import { ChevronDown, Clock } from "lucide-react";

export type TicketOption = { group: string; choice: string };

export type TicketLine = {
  q: number;
  name: string;
  opt?: string;
  options?: TicketOption[];
  price?: string;
};

export type LandingTicketData = {
  n: string;
  name: string;
  status: "preparing" | "ready" | "completed";
  payment?: "unpaid" | "claimed" | "paid";
  age?: { label: string; tone: "normal" | "aging" | "overdue" };
  lines: TicketLine[];
  total?: string;
  action?: string;
  // When set, the chit mirrors the real card's options control: "collapsed"
  // shows a "Show options" affordance + a joined one-line summary; "expanded"
  // shows "Hide options" + each line's options broken out into group→choice
  // rows. Requires lines to carry `options`.
  optionsView?: "collapsed" | "expanded";
};

const STATUS_LABEL = {
  preparing: "Preparing",
  ready: "Ready",
  completed: "Done",
} as const;

const PAYMENT_BADGE = {
  unpaid: { label: "Unpaid", cls: "bg-secondary text-muted-foreground" },
  claimed: { label: "Says paid", cls: "bg-blue-600 text-white" },
  paid: { label: "Paid", cls: "bg-emerald-600 text-white" },
} as const;

export function LandingTicket({ t }: { t: LandingTicketData }) {
  // One full-card attention wash at a time, by priority — same order as the
  // real OrderCard: overdue outranks an unconfirmed payment, which outranks
  // merely aging.
  const wash =
    t.age?.tone === "overdue"
      ? "ticket-overdue"
      : t.payment === "claimed"
        ? "ticket-alert"
        : t.age?.tone === "aging"
          ? "ticket-aging"
          : "border-border";

  const expanded = t.optionsView === "expanded";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-background/60",
        wash,
      )}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0">
          <p className="font-mono text-lg font-bold leading-none">#{t.n}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t.name}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
            style={{
              color: `var(--color-status-${t.status})`,
              backgroundColor: `color-mix(in oklch, var(--color-status-${t.status}) 14%, transparent)`,
            }}
          >
            {STATUS_LABEL[t.status]}
          </span>
          {t.payment && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
                PAYMENT_BADGE[t.payment].cls,
              )}
            >
              {PAYMENT_BADGE[t.payment].label}
            </span>
          )}
          {t.age && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.7rem] font-semibold tabular-nums",
                t.age.tone === "overdue"
                  ? "text-status-cancelled"
                  : t.age.tone === "aging"
                    ? "text-status-aging"
                    : "text-muted-foreground",
              )}
            >
              <Clock className="size-3" />
              {t.age.label}
            </span>
          )}
        </div>
      </div>

      <div className="perforation mx-3" />

      <div className="space-y-1 px-3 py-2">
        {t.lines.map((l, i) => (
          <div key={i} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="truncate">
                <span className="font-mono text-muted-foreground">{l.q}×</span>{" "}
                {l.name}
              </span>
              {l.price && (
                <span className="shrink-0 font-mono text-muted-foreground">
                  {l.price}
                </span>
              )}
            </div>
            {l.options && l.options.length > 0 ? (
              expanded ? (
                <ul className="mt-0.5 space-y-0.5 pl-4">
                  {l.options.map((o, j) => (
                    <li
                      key={j}
                      className="flex justify-between gap-3 text-[0.7rem]"
                    >
                      <span className="font-medium text-foreground/70">
                        {o.group}:
                      </span>
                      <span className="text-right text-foreground/90">
                        {o.choice}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="truncate pl-4 text-[0.7rem] text-muted-foreground">
                  {l.options.map((o) => o.choice).join(" · ")}
                </p>
              )
            ) : (
              l.opt && (
                <p className="truncate pl-4 text-[0.7rem] text-muted-foreground">
                  {l.opt}
                </p>
              )
            )}
          </div>
        ))}
      </div>

      {t.optionsView && (
        <div className="px-3 pb-1">
          <span className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[0.7rem] font-medium text-muted-foreground">
            <ChevronDown className={cn("size-3.5", expanded && "rotate-180")} />
            {expanded ? "Hide options" : "Show options"}
          </span>
        </div>
      )}

      {t.total && (
        <>
          <div className="perforation mx-3" />
          <div className="flex items-baseline justify-between px-3 py-2">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <span className="font-mono text-sm font-bold">{t.total}</span>
          </div>
        </>
      )}

      {t.action && (
        <div className="px-3 pb-3">
          <span className="block rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
            {t.action}
          </span>
        </div>
      )}
    </div>
  );
}
