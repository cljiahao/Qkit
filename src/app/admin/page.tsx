import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { summarizeEvents, summarizeVendors } from "@/lib/admin-stats";
import { MS_PER_DAY } from "@/lib/utils";
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
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();

  const [
    { data: vendorRows },
    { data: eventRows },
    { data: auditRows },
    { count: boothTotal },
    { count: boothActive },
    { count: orderTotal },
    { count: order7d },
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, plan, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("events").select("type, created_at"),
    supabase
      .from("admin_audit")
      .select("id, action, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("booths").select("id", { count: "exact", head: true }),
    supabase
      .from("booths")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", cutoff7d),
  ]);

  const vendors = (vendorRows ?? []) as AdminVendorRow[];
  const vstat = summarizeVendors(vendors, now);
  const estat = summarizeEvents(eventRows ?? [], now);

  const upgradeClicks = estat.byType["upgrade_cta"] ?? 0;
  const landingClicks = estat.byType["landing_cta"] ?? 0;

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
                <span className="font-medium">{row.action}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {JSON.stringify(row.detail)} ·{" "}
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
