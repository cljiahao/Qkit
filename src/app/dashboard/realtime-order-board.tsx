"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pause,
  Play,
  Plus,
  Settings as SettingsIcon,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { OrderCard } from "@/components/order-card";
import { Ticket } from "@/components/ticket";
import {
  displayOrderNumber,
  isTerminal,
  sortActiveOrders,
  type AgeSortOrder,
} from "@/lib/orders";
import { boothColor } from "@/lib/booth-color";
import { fireNewOrderNotification, playSound } from "@/lib/order-alerts";
import { toggleBoothActive } from "./booths/actions";
import { WalkupOrderDialog } from "./walkup-order-dialog";
import { cn } from "@/lib/utils";
import type { BoardOrder, BoardSettings } from "@/lib/types";

type BoothView = {
  id: string;
  name: string;
  is_active: boolean;
  open: boolean;
};

interface Props {
  booths: BoothView[];
  initialOrders: BoardOrder[];
  boardSettings: BoardSettings;
  // The initial server-side read errored — the board may be missing in-flight
  // orders, so warn instead of silently showing "All clear".
  loadError?: boolean;
  // Each booth's first order_number of the SGT day, keyed by booth id — only
  // populated (by the server page) when boardSettings.daily_order_number_reset
  // is on; empty otherwise, which naturally makes displayOrderNumber fall
  // back to each order's real, permanent number.
  dailyOrderNumberBaselines?: Record<string, string>;
}

type BoothFilter = "all" | string;

function LoadErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
    >
      Couldn&apos;t load your current orders. Some in-flight orders may be
      missing. Refresh to try again.
    </div>
  );
}

// One booth's open/paused toggle — a single button, not a two-segment
// control: this is fundamentally one binary action (pause it / resume it),
// and a segmented Open|Paused control cost 2-3x the width to say so. Icon
// alone (a first pass) turned out to be a step too far — without hover on a
// phone, an icon-only Pause/Play read as ambiguous. Icon + the current
// state's own word fixes that at a fraction of the segmented control's
// width. Same play/pause convention as a media player: showing Pause means
// "this is running, tap to stop it"; Play means the reverse. Color still
// carries the state too (emerald = open), so nothing rests on any one cue.
function BoothToggle({
  active,
  onChange,
  boothName,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
  boothName: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(!active)}
          aria-label={
            active
              ? `${boothName} is open. Tap to pause.`
              : `${boothName} is paused. Tap to resume.`
          }
          className={cn(
            "h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-semibold",
            active
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-600"
              : "text-muted-foreground",
          )}
        >
          {active ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {active ? "Open" : "Paused"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {active ? "Pause taking orders" : "Resume taking orders"}
      </TooltipContent>
    </Tooltip>
  );
}

// One booth's row — shared between the solo inline case (a single-booth
// vendor, no need for a modal over one toggle) and the multi-booth status
// dialog below. The header's own compact case (a booth already selected via
// the board's filter dropdown) skips this row entirely and renders
// BoothToggle directly — the dropdown right below already says which booth
// this is, so a bordered pill wrapping just the (already-bordered) toggle
// button would be a border around a border for no reason.
function BoothRow({
  b,
  showDot,
  active,
  onToggle,
}: {
  b: BoothView;
  showDot: boolean;
  active: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      {showDot && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: boothColor(b.id) }}
        />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
      {/* Manually active but outside scheduled hours: customers still see
          it closed. A distinct state from the toggle itself, worth
          surfacing so the vendor isn't confused about why orders still
          aren't landing. */}
      {active && !b.open && (
        <span className="shrink-0 text-xs text-muted-foreground">
          (outside hours)
        </span>
      )}
      <BoothToggle active={active} onChange={onToggle} boothName={b.name} />
    </div>
  );
}

export function RealtimeOrderBoard({
  booths,
  initialOrders,
  boardSettings,
  loadError = false,
  dailyOrderNumberBaselines = {},
}: Props) {
  const router = useRouter();
  const boothIds = booths.map((b) => b.id);
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  const [filter, setFilter] = useState<BoothFilter>("all");
  const [sortOrder, setSortOrder] = useState<AgeSortOrder>("earliest");
  // Optimistic is_active overrides, keyed by booth id — instant toggle
  // feedback ahead of the server round-trip/router.refresh(). Deliberately
  // keyed on the FULL `booths` prop, not visibleBooths: a paused booth with
  // no orders in flight drops out of visibleBooths (see below), which would
  // otherwise make it impossible to find and turn back on.
  const [activeOverrides, setActiveOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  function boothIsActive(b: BoothView) {
    return activeOverrides.get(b.id) ?? b.is_active;
  }
  // Instant toggle, no confirm gate — same instant-tap-plus-undo pattern as
  // OrderCard's advance buttons, for the same reason (a vendor pausing to
  // clear a rush-hour backlog needs this fast and reversible, not gated
  // behind a dialog). Also doubles as its own Undo handler (called with the
  // pre-toggle value).
  function setBoothActive(b: BoothView, active: boolean) {
    setActiveOverrides((prev) => new Map(prev).set(b.id, active));
    void (async () => {
      const res = await toggleBoothActive(b.id, active);
      if (!res.success) {
        toast.error(res.error);
        setActiveOverrides((prev) => new Map(prev).set(b.id, !active));
        return;
      }
      toast(active ? `${b.name} is open for orders` : `${b.name} is paused`, {
        action: { label: "Undo", onClick: () => setBoothActive(b, !active) },
      });
      router.refresh();
    })();
  }
  const activeBoothCount = booths.filter(boothIsActive).length;
  const soleBooth = booths.length === 1 ? booths[0] : undefined;

  // Order ids currently inside an OrderCard undo window (see order-card.tsx) —
  // kept on the active board below even once their status is terminal, so the
  // undo affordance a vendor just tapped doesn't get yanked out from under
  // them by the realtime echo of the very write it's offering to undo.
  const [undoWindowIds, setUndoWindowIds] = useState<Set<string>>(new Set());
  const handleUndoWindowChange = useCallback(
    (orderId: string, active: boolean) => {
      setUndoWindowIds((prev) => {
        if (active === prev.has(orderId)) return prev;
        const next = new Set(prev);
        if (active) next.add(orderId);
        else next.delete(orderId);
        return next;
      });
    },
    [],
  );
  const [walkupOpen, setWalkupOpen] = useState(false);
  const [boothDialogOpen, setBoothDialogOpen] = useState(false);
  // new orders that arrived while hidden
  const [away, setAway] = useState(0);
  const originalTitle = useRef("");

  // Remember the tab title (post-hydration) so the away-badge can restore it.
  useEffect(() => {
    originalTitle.current = document.title;
  }, []);

  // Clear the "while away" badge the moment the vendor looks back at the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setAway(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Reflect the away-count in the tab title so a backgrounded vendor notices.
  useEffect(() => {
    if (away > 0) document.title = `(${away}) New orders · qkit`;
    else if (originalTitle.current) document.title = originalTitle.current;
  }, [away]);

  function handleNewOrder(order: BoardOrder) {
    void playSound(boardSettings.sound_id);
    toast(`New order #${order.order_number} · ${order.customer_name}`);
    if (document.hidden) {
      setAway((n) => n + 1);
      if (boardSettings.desktop_notify) {
        void fireNewOrderNotification(
          boothName.get(order.booth_id) ?? "qkit",
          order.order_number,
        );
      }
    }
  }

  const { orders, status: liveStatus } = useRealtimeOrders(
    boothIds,
    initialOrders,
    handleNewOrder,
  );

  const active = sortActiveOrders(
    orders.filter((o) => !isTerminal(o.status) || undoWindowIds.has(o.id)),
    sortOrder,
  );
  const activeCountFor = (id: string) =>
    active.filter((o) => o.booth_id === id).length;

  // A booth's tab shows only if it's active, still has orders in flight, or
  // is the one the vendor has the board filtered to right now — a turned-off
  // booth with a queue stays until it clears, then self-removes. That last
  // clause matters: without it, pausing the booth you're currently filtered
  // to (with nothing in flight) dropped it from this list on the very same
  // render, which collapsed multiBooth to false and yanked both the filter
  // Select and the header's own toggle out from under the tap that just
  // paused it.
  const visibleBooths = booths.filter(
    (b) => b.is_active || activeCountFor(b.id) > 0 || b.id === filter,
  );
  const multiBooth = visibleBooths.length > 1;

  // If the selected booth's tab vanished, fall back to All.
  const effectiveFilter =
    filter !== "all" && !visibleBooths.some((b) => b.id === filter)
      ? "all"
      : filter;
  // A vendor who's already filtered the board down to one booth doesn't need
  // to open a dialog and find that same booth again just to pause it — the
  // header control becomes that booth's own switch directly.
  const selectedBooth =
    multiBooth && effectiveFilter !== "all"
      ? booths.find((b) => b.id === effectiveFilter)
      : undefined;
  const visible =
    effectiveFilter === "all"
      ? active
      : active.filter((o) => o.booth_id === effectiveFilter);

  // An empty booth list during a read error is almost certainly the error, not a
  // genuinely booth-less vendor — don't show the "No booths yet" onboarding.
  if (booths.length === 0 && loadError) {
    return <LoadErrorBanner />;
  }

  if (booths.length === 0) {
    return (
      <Ticket
        shadow="none"
        dashed
        className="mx-auto mt-10 max-w-md p-10 text-center"
      >
        <p className="font-display text-2xl font-semibold">No booths yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a booth to start receiving orders. Once it&apos;s live, every
          order lands here in real time.
        </p>
        <Button asChild className="mt-6 rounded-lg">
          <Link href="/dashboard/booths/new">
            <Plus className="size-4" /> Add your first booth
          </Link>
        </Button>
      </Ticket>
    );
  }

  const idle = visible.length === 0;

  return (
    <div>
      {loadError && <LoadErrorBanner />}
      {liveStatus === "disconnected" && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
        >
          Live updates interrupted, reconnecting. New orders may be delayed; the
          board re-syncs automatically once it&apos;s back.
        </div>
      )}
      <div
        data-tour="order-board"
        className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            The pass
          </p>
          <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">
            Live orders
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedBooth ? (
            <BoothToggle
              active={boothIsActive(selectedBooth)}
              onChange={(checked) => setBoothActive(selectedBooth, checked)}
              boothName={selectedBooth.name}
            />
          ) : (
            booths.length > 1 && (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setBoothDialogOpen(true)}
                aria-label={`Booth status, ${activeBoothCount} of ${booths.length} open`}
              >
                <Store className="size-3.5" />
                <span className="hidden sm:inline">Booths · </span>
                {activeBoothCount}/{booths.length}
                <span className="hidden sm:inline"> open</span>
              </Button>
            )
          )}
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setWalkupOpen(true)}
            aria-label="New order"
          >
            <Plus className="size-3.5" />
            New<span className="hidden sm:inline"> order</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                <Link href="/dashboard/settings" aria-label="Board settings">
                  <SettingsIcon className="size-3.5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Board settings</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              idle
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-primary/10 text-primary",
            )}
          >
            <span className="relative flex size-2">
              {!idle && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  idle ? "bg-emerald-500" : "bg-primary",
                )}
              />
            </span>
            {idle ? "All clear" : `${visible.length} active`}
          </span>
        </div>
      </div>

      {/* A single-booth vendor gets the pause/resume switch inline — no
          point wrapping one switch in a dialog. Two-plus booths go behind
          the "Booths" header button instead (see below): a wall of pause
          rows would otherwise wrap across the top of the board and push
          every order card down, worse the more booths there are — exactly
          the clutter problem a modal avoids regardless of booth count. */}
      {booths.length === 1 && soleBooth && (
        <div className="mb-6 max-w-sm">
          <BoothRow
            b={soleBooth}
            showDot={false}
            active={boothIsActive(soleBooth)}
            onToggle={(checked) => setBoothActive(soleBooth, checked)}
          />
        </div>
      )}

      <Dialog open={boothDialogOpen} onOpenChange={setBoothDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Booth status</DialogTitle>
            <DialogDescription>
              Pause a booth to stop new orders landing without closing it for
              the day. Handy for clearing a rush-hour backlog. Resume anytime.
            </DialogDescription>
          </DialogHeader>
          {/* Deliberately keyed on the full `booths` list, not visibleBooths,
              so a paused booth with no orders in flight (which
              visibleBooths would otherwise hide) stays reachable to turn
              back on. Instant toggle + an undo toast, same pattern as
              OrderCard's advance buttons: this needs to be fast and
              reversible, not gated behind a confirm step of its own. */}
          <div className="space-y-2">
            {booths.map((b) => (
              <BoothRow
                key={b.id}
                b={b}
                showDot
                active={boothIsActive(b)}
                onToggle={(checked) => setBoothActive(b, checked)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* A dropdown rather than a tab-per-booth row: a vendor running a
            large event (a dozen-plus booths) would otherwise get a wall of
            pills wrapping across several lines before a single order card is
            visible — the opposite of "one look and staff know what to do".
            A Select scales to any booth count without growing the header. */}
        {multiBooth && (
          <Select value={effectiveFilter} onValueChange={setFilter}>
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All booths ({active.length})</SelectItem>
              {visibleBooths.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: boothColor(b.id) }}
                  />
                  <span className="truncate">
                    {b.name} ({activeCountFor(b.id)}){!b.open && " · closed"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Status-agnostic on purpose — a rush-hour vendor triaging "what's
            waited longest" needs an old ready-but-unclaimed order to
            surface too, not stay pinned below every preparing order just
            because of its status. A bumped order still always leads either
            way (see sortActiveOrders). */}
        <div
          role="group"
          aria-label="Sort by order age"
          className="inline-flex rounded-lg border border-border p-0.5 text-sm"
        >
          {(
            [
              { value: "earliest", label: "Earliest" },
              { value: "latest", label: "Latest" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setSortOrder(o.value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                sortOrder === o.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {idle ? (
        <Ticket shadow="none" dashed className="mt-10 py-20 text-center">
          <p className="font-display text-2xl font-semibold">All caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No active orders. Standing by.
          </p>
        </Ticket>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              displayNumber={displayOrderNumber(
                order.order_number,
                dailyOrderNumberBaselines[order.booth_id] ?? null,
              )}
              boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
              agingMin={boardSettings.aging_min}
              overdueMin={boardSettings.overdue_min}
              undoMs={boardSettings.undo_seconds * 1000}
              onUndoWindowChange={handleUndoWindowChange}
            />
          ))}
        </div>
      )}

      <WalkupOrderDialog
        open={walkupOpen}
        onOpenChange={setWalkupOpen}
        booths={booths.filter(boothIsActive)}
        initialBoothId={effectiveFilter !== "all" ? effectiveFilter : undefined}
      />
    </div>
  );
}
