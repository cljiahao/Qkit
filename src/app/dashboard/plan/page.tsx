import { Check, Sparkles, Ticket } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import { Ticket as TicketCard } from "@/components/ticket";
import { UpgradeCta } from "./upgrade-cta";
import { PassCountdown } from "./pass-countdown";

export const revalidate = 0;

// free / pass / pro across the three rungs.
const FEATURES: {
  label: string;
  free: boolean;
  pass: boolean;
  pro: boolean;
}[] = [
  { label: "Live order board", free: true, pass: true, pro: true },
  { label: "QR posters", free: true, pass: true, pro: true },
  { label: "Up to 6 menu items", free: true, pass: true, pro: true },
  {
    label: "Unlimited items & customization",
    free: false,
    pass: true,
    pro: true,
  },
  { label: "Extra booths", free: false, pass: true, pro: true },
  { label: "Scheduled auto-close hours", free: false, pass: true, pro: true },
  { label: "Sold-out stock caps", free: false, pass: true, pro: true },
  { label: "This event's stats", free: false, pass: true, pro: true },
  {
    label: "Full history & trends (7/30/90d)",
    free: false,
    pass: false,
    pro: true,
  },
];

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? (
        <Check className="size-4 text-status-ready" />
      ) : (
        <span className="text-muted-foreground/40">-</span>
      )}
    </span>
  );
}

export default async function PlanPage() {
  const { entitlement, licenseExpiresAt } = await requireEntitledVendor();

  const supabase = await createServerClient();
  const { data: pricingRow } = await supabase
    .from("pricing")
    .select("event_pass_cents, monthly_cents, currency")
    .eq("id", 1)
    .maybeSingle();
  const pricing = pricingRow ?? DEFAULT_PRICING;
  // Prices unset (= pre-Stripe beta) → the pass is a free trial we grant on
  // request. Set prices in /admin to flip the whole page to paid/PayNow.
  const passPrice =
    pricing.event_pass_cents > 0 ? formatPrice(pricing.event_pass_cents) : null;
  const monthlyPrice =
    pricing.monthly_cents > 0 ? formatPrice(pricing.monthly_cents) : null;
  const paidMode = passPrice !== null || monthlyPrice !== null;

  const tier = entitlement.tier;

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Plan
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
            tier === "free"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          }`}
        >
          {tier === "pro" && <Sparkles className="size-3.5" />}
          {tier === "pass" && <Ticket className="size-3.5" />}
          {tier === "pro" ? "Pro" : tier === "pass" ? "Event pass" : "Free"}
        </span>
      </div>

      {tier === "pass" && licenseExpiresAt && (
        <PassCountdown expiresAt={licenseExpiresAt} />
      )}

      {tier === "pro" ? (
        <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro. Unlimited booths, scheduling, sold-out caps, and
          full stats are unlocked. Thanks for supporting QKit.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Event pass */}
          <TicketCard shadow="none" className="flex flex-col bg-card p-5">
            <div className="flex items-center gap-2">
              <Ticket className="size-4 text-primary" />
              <h2 className="font-display text-xl font-semibold">Event pass</h2>
            </div>
            <p className="mt-1 font-mono text-2xl font-bold">
              {passPrice ?? "Free"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {passPrice ? "/ day" : "in beta"}
              </span>
            </p>
            {passPrice && (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              All Pro features for your event: extra booths, customization,
              auto-close, sold-out caps, and that event&apos;s stats. Pick the
              dates, pay per day. Best for the occasional market.
            </p>
            <div className="mt-4">
              <UpgradeCta
                option="event"
                label={paidMode ? "Get a pass" : "Request a pass"}
              />
            </div>
          </TicketCard>

          {/* Monthly */}
          <TicketCard
            shadow="none"
            className="flex flex-col border-primary/40 bg-card p-5"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-display text-xl font-semibold">
                Monthly Pro
              </h2>
            </div>
            <p className="mt-1 font-mono text-2xl font-bold">
              {monthlyPrice ?? "Soon"}
              {monthlyPrice && (
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / month
                </span>
              )}
            </p>
            {monthlyPrice && (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Everything in the pass, plus full sales history and trends
              (7/30/90 days). Best if you trade most weeks.
            </p>
            <div className="mt-4">
              <UpgradeCta
                option="monthly"
                label={monthlyPrice ? "Go monthly" : "Notify me"}
                variant="outline"
              />
            </div>
          </TicketCard>
        </div>
      )}

      {tier !== "pro" && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
          {paidMode
            ? "Founding price, locks in while we're in beta. Pay by PayNow or cash; message us and we'll activate your pass. Card payments coming soon."
            : "Free while we're in beta. Message us and we'll unlock the full kit for your next event. Per-event and monthly pricing arrive with card payments."}
        </p>
      )}

      {/* Three-rung comparison. Header and every row use the same fixed
          column widths (not "auto") so the Free/Pass/Pro ticks line up under
          their headers regardless of each row being its own grid instance. */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pass</span>
          <span className="text-center">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] items-center gap-x-5 border-t border-border px-5 py-3 text-sm"
          >
            <span>{f.label}</span>
            <Cell on={f.free} />
            <Cell on={f.pass} />
            <Cell on={f.pro} />
          </div>
        ))}
      </div>
    </div>
  );
}
