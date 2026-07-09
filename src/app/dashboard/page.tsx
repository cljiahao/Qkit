import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseBoothHours } from "@/lib/schemas";
import { isBoothOpen } from "@/lib/hours";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { BoardOrder } from "@/lib/types";

export const revalidate = 0;

export default async function DashboardPage() {
  // Reuse the entitlement cache the layout already primed (same React.cache),
  // so this doesn't add a second vendor-row round-trip via getVendor.
  const { vendor } = await requireEntitledVendor();

  const supabase = await createServerClient();

  const { data: booths, error: boothErr } = await supabase
    .from("booths")
    .select("id, name, is_active, hours")
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

  return (
    <RealtimeOrderBoard
      booths={boothViews}
      initialOrders={orders}
      boardSettings={vendor.board_settings}
      loadError={loadError}
    />
  );
}
