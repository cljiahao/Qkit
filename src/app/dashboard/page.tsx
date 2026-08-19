import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseBoothHours } from "@/lib/schemas";
import { isBoothOpen } from "@/lib/hours";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { sgtStartOfDayIso } from "@/lib/tz";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { BoardOrder } from "@/lib/types";

export const revalidate = 0;

/**
 * Daily order-number reset (board_settings.daily_order_number_reset): the
 * board shows each order's position among *today's* orders instead of its
 * permanent order_number (see displayOrderNumber in @/lib/orders). The
 * baseline — each booth's first order_number of the SGT day — only needs
 * computing once per page load (it can't change again until midnight), so
 * this is one extra query total, not one per booth, and skipped entirely
 * when the setting is off (the common case).
 */
async function loadDailyOrderNumberBaselines(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothIds: string[],
): Promise<Record<string, string>> {
  const baselines: Record<string, string> = {};
  if (boothIds.length === 0) return baselines;
  const { data: todaysOrders, error } = await supabase
    .from("orders")
    .select("booth_id, order_number")
    .in("booth_id", boothIds)
    .gte("created_at", sgtStartOfDayIso())
    .order("order_number", { ascending: true });
  if (error) {
    // Non-critical/decorative — degrade to showing the real order_number
    // (displayOrderNumber's own null-baseline fallback) rather than fail the
    // whole board over it.
    console.error("dashboard daily-baseline read failed", error.message);
    return baselines;
  }
  for (const o of todaysOrders ?? []) {
    if (!(o.booth_id in baselines)) baselines[o.booth_id] = o.order_number;
  }
  return baselines;
}

export default async function DashboardPage() {
  // Reuse the entitlement cache the layout already primed (same React.cache),
  // so this doesn't add a second vendor-row round-trip via getVendor.
  const { vendor } = await requireEntitledVendor();

  const supabase = await createServerClient();

  const { data: booths, error: boothErr } = await supabase
    .from("booths")
    .select("id, name, is_active, hours, walkup_default")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });
  if (boothErr) console.error("dashboard booths read failed", boothErr.message);

  // Open/closed as of this request (SGT); revalidate=0 re-evaluates on nav.
  const nowIso = new Date().toISOString();
  const boothViews = (booths ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_active: b.is_active,
    open: isBoothOpen(
      { is_active: b.is_active, hours: parseBoothHours(b.hours) },
      nowIso,
    ),
    walkup_default: b.walkup_default,
  }));

  const boothIds = (booths ?? []).map((b) => b.id);

  let orders: BoardOrder[] = [];
  let ordersErr = null;
  if (boothIds.length) {
    const { data, error } = await supabase
      .from("orders")
      .select(BOARD_ORDER_COLUMNS)
      .in("booth_id", boothIds)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false });
    ordersErr = error;
    if (error) console.error("dashboard orders read failed", error.message);
    orders = data ?? [];
  }

  // A read error must not masquerade as an empty board — a vendor could think
  // the queue is clear when it isn't. Surface a retry banner instead.
  const loadError = Boolean(boothErr) || Boolean(ordersErr);

  const dailyOrderNumberBaselines = vendor.board_settings
    .daily_order_number_reset
    ? await loadDailyOrderNumberBaselines(supabase, boothIds)
    : {};

  return (
    <RealtimeOrderBoard
      booths={boothViews}
      initialOrders={orders}
      boardSettings={vendor.board_settings}
      loadError={loadError}
      dailyOrderNumberBaselines={dailyOrderNumberBaselines}
    />
  );
}
