import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { bearerOk } from "@/lib/merqo-auth";
import { computeMerqoMetrics } from "@/lib/merqo-metrics";
import type { Plan } from "@/lib/types";

export const revalidate = 0;

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // Five independent reads — issue them concurrently so endpoint latency is one
  // round-trip, not the sum of five.
  const [vendorsRes, boothsRes, ordersRes, paymentsRes, pendingRes] =
    await Promise.all([
      supabase.from("vendors").select("id, plan, created_at"),
      supabase.from("booths").select("id, vendor_id"),
      supabase
        .from("orders")
        .select("booth_id, status, total_cents, created_at"),
      supabase.from("payments").select("amount_cents, created_at"),
      supabase
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  for (const r of [vendorsRes, boothsRes, ordersRes, paymentsRes, pendingRes]) {
    if (r.error) {
      console.error("merqo metrics: read failed", r.error.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    }
  }

  const metrics = computeMerqoMetrics({
    nowMs: Date.now(),
    vendors: (vendorsRes.data ?? []) as {
      id: string;
      plan: Plan;
      created_at: string;
    }[],
    booths: (boothsRes.data ?? []) as { id: string; vendor_id: string }[],
    orders: (ordersRes.data ?? []) as {
      booth_id: string;
      status: string;
      total_cents: number;
      created_at: string;
    }[],
    payments: (paymentsRes.data ?? []) as {
      amount_cents: number;
      created_at: string;
    }[],
    pendingUpgradeCount: pendingRes.count ?? 0,
  });

  return NextResponse.json({
    product: "qkit",
    generated_at: new Date().toISOString(),
    ...metrics,
  });
}
