import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { summarizeVendors } from "@/lib/admin-stats";
import { pctChange } from "@/lib/stats";
import { MS_PER_DAY } from "@/lib/utils";
import { Stat } from "../stat";
import { VendorTable, type AdminVendorRow } from "../vendor-table";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(now - 14 * MS_PER_DAY).toISOString();

  const [{ data: vendorRows }, { data: licenseRows }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, plan, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("licenses").select("vendor_id, valid_from, expires_at"),
  ]);

  // Latest currently-active pass per vendor (valid_from <= now < expires_at).
  const passByVendor = new Map<string, string>();
  for (const l of licenseRows ?? []) {
    if (Date.parse(l.valid_from) > now || Date.parse(l.expires_at) <= now)
      continue;
    const cur = passByVendor.get(l.vendor_id);
    if (!cur || Date.parse(l.expires_at) > Date.parse(cur))
      passByVendor.set(l.vendor_id, l.expires_at);
  }

  const vendors: AdminVendorRow[] = (vendorRows ?? []).map((v) => ({
    ...v,
    passExpiresAt: passByVendor.get(v.id) ?? null,
  }));

  const vstat = summarizeVendors(vendors, now);
  const signupsPrior7d = vendors.filter(
    (v) => v.created_at >= cutoff14d && v.created_at < cutoff7d,
  ).length;
  const onPass = vendors.filter((v) => v.passExpiresAt).length;

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
        <Stat label="Pro" value={vstat.pro} delay={60} />
        <Stat label="On a live pass" value={onPass} delay={120} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
          delay={180}
        />
      </div>

      <VendorTable vendors={vendors} />
    </div>
  );
}
