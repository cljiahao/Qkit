import { redirect } from "next/navigation";
import { Check, Sparkles, Ticket } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import { formatPrice } from "@/lib/utils";
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
        <span className="text-muted-foreground/40">—</span>
      )}
    </span>
  );
}

export default async function PlanPage() {
  const { user, vendor, entitlement, licenseExpiresAt } =
    await loadEntitlement();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();
  const { data: pricingRow } = await supabase
    .from("pricing")
    .select("event_pass_cents, monthly_cents, currency")
    .eq("id", 1)
    .maybeSingle();
  const pricing = pricingRow ?? {
    event_pass_cents: 0,
    monthly_cents: 0,
    currency: "SGD",
  };

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
          You&apos;re on Pro — unlimited booths, scheduling, sold-out caps, and
          full stats are unlocked. Thanks for supporting QKit.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Event pass */}
          <div className="ticket flex flex-col rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Ticket className="size-4 text-primary" />
              <h2 className="font-display text-xl font-semibold">Event pass</h2>
            </div>
            <p className="mt-1 font-mono text-2xl font-bold">
              {formatPrice(pricing.event_pass_cents)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / event
              </span>
            </p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              All Pro features for the event — extra booths, customization,
              auto-close, sold-out caps, and that event&apos;s stats. Best for
              the occasional market.
            </p>
            <div className="mt-4">
              <UpgradeCta option="event" label="Get a pass" />
            </div>
          </div>

          {/* Monthly */}
          <div className="ticket flex flex-col rounded-2xl border border-primary/40 bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-display text-xl font-semibold">
                Monthly Pro
              </h2>
            </div>
            <p className="mt-1 font-mono text-2xl font-bold">
              {formatPrice(pricing.monthly_cents)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / month
              </span>
            </p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              Everything in the pass, plus full sales history and trends
              (7/30/90 days). Best if you trade most weeks.
            </p>
            <div className="mt-4">
              <UpgradeCta
                option="monthly"
                label="Go monthly"
                variant="outline"
              />
            </div>
          </div>
        </div>
      )}

      {tier !== "pro" && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
          Pay by PayNow or cash — message us and we&apos;ll activate your pass.
          Card payments are coming soon.
        </p>
      )}

      {/* Three-rung comparison */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pass</span>
          <span className="text-center">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-5 border-t border-border px-5 py-3 text-sm"
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
