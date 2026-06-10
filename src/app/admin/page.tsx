import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { summarizeEvents, summarizeVendors } from "@/lib/admin-stats";
import { VendorTable, type AdminVendorRow } from "./vendor-table";

export const revalidate = 0;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createServerClient();

  // Reading the wall clock in an async server component is intentional here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * 86_400_000).toISOString();

  const [{ data: vendorRows }, { data: eventRows }, { data: boothRows }] =
    await Promise.all([
      supabase
        .from("vendors")
        .select("id, name, plan, is_admin, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("events").select("type, created_at"),
      supabase.from("booths").select("id, vendor_id, is_active"),
    ]);

  const vendors = (vendorRows ?? []) as AdminVendorRow[];

  // Exclude internal (admin) accounts from the numbers so test booths/orders
  // don't skew the metrics. The vendor table below still lists everyone.
  const adminVendorIds = new Set(
    vendors.filter((v) => v.is_admin).map((v) => v.id),
  );
  const realBooths = (boothRows ?? []).filter(
    (b) => !adminVendorIds.has(b.vendor_id),
  );
  const adminBoothIds = (boothRows ?? [])
    .filter((b) => adminVendorIds.has(b.vendor_id))
    .map((b) => b.id);

  const boothTotal = realBooths.length;
  const boothActive = realBooths.filter((b) => b.is_active).length;

  // Orders can grow large — count in the DB, excluding admin-owned booths.
  let orderTotalQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true });
  let order7dQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoff7d);
  if (adminBoothIds.length) {
    const exclude = `(${adminBoothIds.join(",")})`;
    orderTotalQuery = orderTotalQuery.not("booth_id", "in", exclude);
    order7dQuery = order7dQuery.not("booth_id", "in", exclude);
  }
  const [{ count: orderTotal }, { count: order7d }] = await Promise.all([
    orderTotalQuery,
    order7dQuery,
  ]);

  const vstat = summarizeVendors(
    vendors.filter((v) => !v.is_admin),
    now,
  );
  const estat = summarizeEvents(eventRows ?? [], now);

  const upgradeClicks = estat.byType["upgrade_cta"] ?? 0;
  const landingClicks = estat.byType["landing_cta"] ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Internal
          </p>
          <h1 className="font-display text-4xl font-semibold leading-none">
            Admin
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="size-4" /> Dashboard
          </span>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subscriptions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Vendors" value={vstat.total} />
          <Stat label="Pro" value={vstat.pro} />
          <Stat label="Free" value={vstat.free} />
          <Stat label="Signups · 7d" value={vstat.new7d} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Booths" value={boothTotal ?? 0} />
          <Stat label="Active booths" value={boothActive ?? 0} />
          <Stat label="Orders" value={orderTotal ?? 0} />
          <Stat label="Orders · 7d" value={order7d ?? 0} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Funnel
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Landing CTA clicks" value={landingClicks} />
          <Stat label="Upgrade CTA clicks" value={upgradeClicks} />
          <Stat
            label="Upgrade → Pro"
            value={
              upgradeClicks
                ? `${Math.round((vstat.pro / upgradeClicks) * 100)}%`
                : "—"
            }
          />
          <Stat label="Events" value={estat.total} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vendors
        </h2>
        <VendorTable vendors={vendors} />
      </section>
    </div>
  );
}
