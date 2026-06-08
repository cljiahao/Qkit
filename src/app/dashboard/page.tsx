import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getVendor } from "@/lib/supabase/get-vendor";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { Order } from "@/lib/types";

export const revalidate = 0;

export default async function DashboardPage() {
  const { user, vendor } = await getVendor();
  if (!user) redirect("/login");
  if (!vendor) redirect("/onboarding");

  const supabase = await createServerClient();

  const { data: booths } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });

  const boothIds = (booths ?? []).map((b) => b.id);

  let orders: Order[] = [];
  if (boothIds.length) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .in("booth_id", boothIds)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false });
    orders = data ?? [];
  }

  return <RealtimeOrderBoard booths={booths ?? []} initialOrders={orders} />;
}
