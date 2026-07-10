import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { latestActivePassByVendor } from "@/lib/admin-stats";
import { buildVendorHealth, passHoursLeft } from "@/lib/admin-vendor-health";
import { cn, formatPrice, MS_PER_DAY } from "@/lib/utils";
import { Stat } from "../../stat";
import { StatusChip } from "../../vendor-status";
import { VendorManage } from "../../vendor-manage";
import { ResolveMessageButton } from "../../resolve-message-button";

export const revalidate = 0;

const CATEGORY_LABEL: Record<string, string> = {
  pass: "Event pass",
  payment: "Payment",
  pro: "Pro / billing",
  other: "Something else",
};

/** A milestone row in the activation timeline: reached (date) or still pending. */
function Milestone({ label, at }: { label: string; at: string | null }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {at ? (
        <Check className="size-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground/40" />
      )}
      <span className={cn(!at && "text-muted-foreground")}>{label}</span>
      <span className="ml-auto font-mono text-xs text-muted-foreground">
        {at ? at.slice(0, 10) : "—"}
      </span>
    </li>
  );
}

export default async function AdminVendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // All four scoped to this one vendor (never the fleet fetch-all) and
  // independent of each other — one round trip instead of vendor-then-rest.
  const [
    { data: vendor },
    { data: booths },
    { data: licenses },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, plan, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("booths")
      .select("id, name, is_active, created_at")
      .eq("vendor_id", id),
    supabase
      .from("licenses")
      .select("vendor_id, valid_from, expires_at, note")
      .eq("vendor_id", id)
      .order("valid_from", { ascending: false }),
    supabase
      .from("support_messages")
      .select("id, category, body, status, created_at")
      .eq("vendor_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!vendor) notFound();

  const boothRows = booths ?? [];
  const boothIds = boothRows.map((b) => b.id);
  const { data: orders } = boothIds.length
    ? await supabase
        .from("orders")
        .select("booth_id, status, total_cents, created_at")
        .in("booth_id", boothIds)
    : { data: [] };
  const orderRows = orders ?? [];

  const passByVendor = latestActivePassByVendor(licenses ?? [], now);
  const passExpiresAt = passByVendor.get(id) ?? null;
  const hasOpenMsg = (messages ?? []).some((m) => m.status === "open");
  const openMsgVendors = new Set(hasOpenMsg ? [id] : []);
  const health = buildVendorHealth(
    [{ id, plan: vendor.plan, created_at: vendor.created_at, passExpiresAt }],
    boothRows.map((b) => ({
      id: b.id,
      vendor_id: id,
      created_at: b.created_at,
    })),
    orderRows,
    openMsgVendors,
    now,
  ).get(id)!;

  const live = orderRows.filter((o) => o.status !== "cancelled");
  const revenue = live.reduce((sum, o) => sum + o.total_cents, 0);
  const firstBoothAt =
    boothRows.reduce<string | null>(
      (min, b) => (min === null || b.created_at < min ? b.created_at : min),
      null,
    ) ?? null;
  const firstOrderAt =
    live.reduce<string | null>(
      (min, o) => (min === null || o.created_at < min ? o.created_at : min),
      null,
    ) ?? null;
  const passLeftHours = passHoursLeft(passExpiresAt, now);
  const daysSinceLast = health.lastOrderAt
    ? Math.round((now - Date.parse(health.lastOrderAt)) / MS_PER_DAY)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
      <div className="space-y-3">
        <Link
          href="/admin/vendors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All vendors
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold leading-none">
            {vendor.name}
          </h1>
          <StatusChip status={health.status} />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {vendor.plan === "pro" ? "Pro" : "Free"}
            {passLeftHours !== null && ` · pass ${passLeftHours}h`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={health.orderCount} delay={0} />
        <Stat label="Revenue" value={formatPrice(revenue)} delay={60} />
        <Stat
          label="Booths"
          value={`${boothRows.filter((b) => b.is_active).length}/${boothRows.length}`}
          delay={120}
        />
        <Stat
          label="Last order"
          value={daysSinceLast === null ? "—" : `${daysSinceLast}d ago`}
          delay={180}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activation
        </h2>
        <ul className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <Milestone label="Signed up" at={vendor.created_at} />
          <Milestone label="Created a booth" at={firstBoothAt} />
          <Milestone label="Took first order" at={firstOrderAt} />
          <Milestone
            label="Upgraded to Pro"
            at={vendor.plan === "pro" ? vendor.created_at : null}
          />
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Help requests
        </h2>
        {(messages ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No messages from this vendor.
          </p>
        ) : (
          <div className="space-y-2">
            {(messages ?? []).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  m.status === "open"
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-border bg-card opacity-70",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold">
                      {CATEGORY_LABEL[m.category] ?? m.category}
                    </span>
                    {m.status === "resolved" && (
                      <span className="text-xs text-muted-foreground">
                        Resolved
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.created_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </span>
                  {m.status === "open" && <ResolveMessageButton id={m.id} />}
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Manage
        </h2>
        <VendorManage
          vendor={{
            id: vendor.id,
            name: vendor.name,
            plan: vendor.plan,
            created_at: vendor.created_at,
            passExpiresAt,
          }}
        />
        {(licenses ?? []).length > 0 && (
          <ul className="space-y-1 pt-1">
            {(licenses ?? []).map((l, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-1.5 font-mono text-xs text-muted-foreground"
              >
                <span>
                  {l.valid_from.slice(0, 10)} → {l.expires_at.slice(0, 10)}
                </span>
                {l.note && <span className="truncate">{l.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
