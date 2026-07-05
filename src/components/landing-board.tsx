// Data-driven "live order board" for the landing hero. Renders the same
// container/header markup as landing-board-preview.tsx, but takes its ticket
// data as a prop so the hero can carousel through multiple scenario boards.

import { LandingTicket, type LandingTicketData } from "./landing-ticket";

export type LandingBoardData = {
  key: string;
  title: string;
  activeCount: number;
  tickets: LandingTicketData[];
};

export function LandingBoard({ board }: { board: LandingBoardData }) {
  return (
    <div className="ticket relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_24px_48px_-32px_oklch(0.4_0.06_45/0.45)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live orders
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {board.activeCount} active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {board.tickets.map((t) => (
          <LandingTicket key={t.n} t={t} />
        ))}
      </div>
    </div>
  );
}
