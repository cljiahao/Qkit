import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { sgtStartOfDayIso } from "@/lib/tz";
import { CompletedOrdersList } from "./completed-orders-list";
import type { BoardOrder } from "@/lib/types";

export const revalidate = 0;

const HISTORY_LIMIT = 500;

export default async function CompletedOrdersPage() {
  const { vendor } = await requireEntitledVendor();
  const supabase = await createServerClient();

  const { data: booths, error: boothErr } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });
  if (boothErr)
    console.error("completed orders booths read failed", boothErr.message);

  const boothIds = (booths ?? []).map((b) => b.id);

  let orders: BoardOrder[] = [];
  let ordersErr = null;
  if (boothIds.length) {
    const { data, error } = await supabase
      .from("orders")
      .select(BOARD_ORDER_COLUMNS)
      .in("booth_id", boothIds)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    ordersErr = error;
    if (error) console.error("completed orders read failed", error.message);
    orders = data ?? [];
  }

  const loadError = Boolean(boothErr) || Boolean(ordersErr);

  return (
    <div>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Order history
        </p>
        <h1 className="font-display text-4xl font-semibold leading-none">
          Completed orders
        </h1>
      </header>
      <CompletedOrdersList
        booths={booths ?? []}
        orders={orders}
        loadError={loadError}
        historyLimit={HISTORY_LIMIT}
        todayStartIso={sgtStartOfDayIso()}
      />
    </div>
  );
}
