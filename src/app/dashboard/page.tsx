import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { Order } from "@/lib/types";

export const revalidate = 0;

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: booths } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", user.id)
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
