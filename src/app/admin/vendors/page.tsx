import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { latestActivePassByVendor, summarizeVendors } from "@/lib/admin-stats";
import {
  buildVendorHealth,
  passHoursLeft,
  statusRank,
  type VendorLite,
} from "@/lib/admin-vendor-health";
import { pctChange } from "@/lib/stats";
import { MS_PER_DAY } from "@/lib/utils";
import { Stat } from "../stat";
import { VendorList, type VendorListItem } from "../vendor-list";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(now - 14 * MS_PER_DAY).toISOString();

  const [
    { data: vendorRows },
    { data: licenseRows },
    { data: boothRows },
    { data: orderRows },
    { data: messageRows },
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, plan, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("licenses").select("vendor_id, valid_from, expires_at"),
    supabase.from("booths").select("id, vendor_id, created_at"),
    supabase.from("orders").select("booth_id, status, created_at"),
    supabase.from("support_messages").select("vendor_id").eq("status", "open"),
  ]);

  const rows = vendorRows ?? [];
  const passByVendor = latestActivePassByVendor(licenseRows ?? [], now);
  const openMsgVendors = new Set((messageRows ?? []).map((m) => m.vendor_id));

  const vendorLites: VendorLite[] = rows.map((v) => ({
    id: v.id,
    plan: v.plan,
    created_at: v.created_at,
    passExpiresAt: passByVendor.get(v.id) ?? null,
  }));
  const health = buildVendorHealth(
    vendorLites,
    boothRows ?? [],
    orderRows ?? [],
    openMsgVendors,
    now,
  );

  const items: VendorListItem[] = rows
    .map((v) => {
      const h = health.get(v.id)!;
      const expiry = passByVendor.get(v.id);
      return {
        id: v.id,
        name: v.name,
        plan: v.plan,
        created_at: v.created_at,
        passHoursLeft: passHoursLeft(expiry, now),
        status: h.status,
        orders7d: h.orders7d,
        lastOrderAt: h.lastOrderAt,
        boothCount: h.boothCount,
      };
    })
    // Most-urgent first; ties keep the newest signup on top.
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.created_at.localeCompare(a.created_at),
    );

  const vstat = summarizeVendors(vendorLites, now);
  const signupsPrior7d = vendorLites.filter(
    (v) => v.created_at >= cutoff14d && v.created_at < cutoff7d,
  ).length;
  const onPass = vendorLites.filter((v) => v.passExpiresAt).length;
  const atRisk = items.filter((i) =>
    ["attention", "expiring", "stuck"].includes(i.status),
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Vendors
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vendors" value={vstat.total} delay={0} />
        <Stat label="Needs a look" value={atRisk} delay={60} />
        <Stat label="On a live pass" value={onPass} delay={120} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
          delay={180}
        />
      </div>

      <VendorList vendors={items} />
    </div>
  );
}
