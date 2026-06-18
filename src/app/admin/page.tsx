import { ArrowDown, ArrowUp } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import {
  activationFunnel,
  summarizeEvents,
  summarizeVendors,
} from "@/lib/admin-stats";
import { pctChange, windowSeries, type StatsOrder } from "@/lib/stats";
import { cn, formatPrice, MS_PER_DAY } from "@/lib/utils";
import type { Plan } from "@/lib/types";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { VendorTable, type AdminVendorRow } from "./vendor-table";
import { PricingForm } from "./pricing-form";
import { ActivationFunnelView } from "./activation-funnel";
import { TrendChart } from "../dashboard/stats/trend-chart";

export const revalidate = 0;

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-semibold",
        up ? "text-emerald-600" : "text-status-cancelled",
      )}
      title="vs the previous 7 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function Stat({
  label,
  value,
  delta,
  big,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  big?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        big && "sm:col-span-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p
        className={cn(
          "mt-1 font-mono font-bold tabular-nums",
          big ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function humanizeAction(action: string): string {
  const s = action.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanizeDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createServerClient();

  // Reading the wall clock in an async server component is intentional here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(now - 14 * MS_PER_DAY).toISOString();
  const cutoff30d = new Date(now - 30 * MS_PER_DAY).toISOString();

  // NOTE: fetching all booths/orders is fine at validation scale; revisit with
  // server-side aggregation if volume grows.
  const [
    { data: vendorRows },
    { data: boothRows },
    { data: orderRows },
    { data: eventRows },
    { data: auditRows },
    { data: pricingRow },
    { data: licenseRows },
    { data: paymentRows },
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, plan, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("booths").select("id, vendor_id, is_active"),
    supabase.from("orders").select("booth_id, status, total_cents, created_at"),
    supabase.from("events").select("type, created_at"),
    supabase
      .from("admin_audit")
      .select("id, action, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("pricing")
      .select("event_pass_cents, monthly_cents, currency")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("licenses").select("vendor_id, valid_from, expires_at"),
    supabase.from("payments").select("amount_cents, created_at"),
  ]);

  const licenses = licenseRows ?? [];
  const payments = paymentRows ?? [];

  // Latest currently-active pass per vendor (in-window: valid_from <= now <
  // expires_at; longest remaining wins). A scheduled-future pass isn't "live".
  const passByVendor = new Map<string, string>();
  for (const l of licenses) {
    if (Date.parse(l.valid_from) > now || Date.parse(l.expires_at) <= now)
      continue;
    const cur = passByVendor.get(l.vendor_id);
    if (!cur || Date.parse(l.expires_at) > Date.parse(cur))
      passByVendor.set(l.vendor_id, l.expires_at);
  }

  // QKit's own revenue — what we actually collected, from the payments ledger
  // (NOT vendor GMV). Beta comps record no payment, so this is honest earnings.
  const revenue30d = payments
    .filter((p) => p.created_at >= cutoff30d)
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const revenueAll = payments.reduce((sum, p) => sum + p.amount_cents, 0);

  const vendors: AdminVendorRow[] = (vendorRows ?? []).map((v) => ({
    ...v,
    passExpiresAt: passByVendor.get(v.id) ?? null,
  }));
  const pricing = pricingRow ?? DEFAULT_PRICING;
  const booths = boothRows ?? [];
  const orders = orderRows ?? [];
  const events = eventRows ?? [];

  const vstat = summarizeVendors(vendors, now);
  const estat = summarizeEvents(events, now);
  const funnel = activationFunnel(
    vendors as { id: string; plan: Plan }[],
    booths,
    orders.map((o) => o.booth_id),
  );

  // Orders: 7d vs prior 7d (Δ) + a 14-day trend.
  const inWindow = (t: string, gte: string, lt?: string) =>
    t >= gte && (lt === undefined || t < lt);
  const orders7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff7d),
  ).length;
  const ordersPrior7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff14d, cutoff7d),
  ).length;
  const signupsPrior7d = vendors.filter((v) =>
    inWindow(v.created_at, cutoff14d, cutoff7d),
  ).length;

  // 14-day trend of QKit revenue (collected pass/sub amounts), not vendor sales.
  const revSeries = windowSeries(
    payments.map(
      (p): StatsOrder => ({
        status: "completed",
        total_cents: p.amount_cents,
        items: [],
        created_at: p.created_at,
      }),
    ),
    now,
    14,
    MS_PER_DAY,
  );

  const landingClicks = estat.byType["landing_cta"] ?? 0;
  const upgradeClicks = estat.byType["upgrade_cta"] ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Overview
        </h1>
      </div>

      {/* North-star band — QKit revenue leads; active vendors is the leading
          indicator behind it. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="QKit revenue · 30d" value={formatPrice(revenue30d)} big />
        <Stat label="Revenue · all time" value={formatPrice(revenueAll)} />
        <Stat label="Active vendors" value={funnel.withOrder} />
        <Stat label="Pro" value={vstat.pro} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
        />
        <Stat
          label="Orders · 7d"
          value={orders7d}
          delta={pctChange(orders7d, ordersPrior7d)}
        />
        <Stat label="Vendors" value={vstat.total} />
        <Stat
          label="Active booths"
          value={booths.filter((b) => b.is_active).length}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ActivationFunnelView funnel={funnel} />
        <TrendChart series={revSeries} range="14d" title="QKit revenue" />
      </div>

      <p className="text-xs text-muted-foreground">
        Funnel signals · {landingClicks} landing CTA · {upgradeClicks} upgrade
        CTA clicks
      </p>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pricing
        </h2>
        <PricingForm initial={pricing} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vendors
        </h2>
        <VendorTable vendors={vendors} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent admin activity
        </h2>
        {(auditRows ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No admin actions yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {(auditRows ?? []).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="font-medium">
                  {humanizeAction(row.action)}
                  {humanizeDetail(row.detail) && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {humanizeDetail(row.detail)}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {row.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
