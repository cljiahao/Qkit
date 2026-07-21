import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { BackButton } from "@/components/back-button";
import { currentPrepEstimate, type StatsOrder } from "@/lib/stats";
import { SettingsForm } from "./settings-form";

export const revalidate = 0;

// Matches getWaitEstimate's own RECENT_ORDER_LIMIT (status-actions.ts) — same
// "last N completed orders" window the live per-order estimate draws from.
const RECENT_ORDER_LIMIT = 20;

export default async function SettingsPage() {
  const { vendor } = await requireEntitledVendor();
  const supabase = await createServerClient();

  const { data: booths } = await supabase
    .from("booths")
    .select("id")
    .eq("vendor_id", vendor.id);
  const boothIds = (booths ?? []).map((b) => b.id);

  // Vendor-wide approximation, not per-booth like the live estimate
  // (default_prep_minutes itself is one vendor-wide fallback, not per booth,
  // so this matches that granularity) — combines recent completed orders
  // across every booth the vendor owns.
  let prepEstimate = currentPrepEstimate([]);
  if (boothIds.length) {
    const { data: recent } = await supabase
      .from("orders")
      .select("status, created_at, ready_at, total_cents, items")
      .in("booth_id", boothIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(RECENT_ORDER_LIMIT);
    prepEstimate = currentPrepEstimate((recent ?? []) as StatsOrder[]);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 md:max-w-4xl">
      <header>
        <div className="mb-2 -ml-2.5">
          <BackButton href="/dashboard" label="Back to board" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live orders
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Board settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How the order board alerts you and flags a ticket that&apos;s waiting
          too long. Synced to your account, so it follows you to any device.
        </p>
      </header>

      <SettingsForm
        initial={vendor.board_settings}
        prepEstimate={prepEstimate}
      />
    </div>
  );
}
