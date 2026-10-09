import { NextResponse } from "next/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { createServiceClient } from "@/lib/supabase/server";
import { bearerOk } from "@/lib/merqo/auth";
import { computeMerqoMetrics } from "@/lib/merqo/metrics";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/lib/types";

export const revalidate = 0;

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts enumeration/DoS once compromised.
  const allowed = await rateLimit(
    `merqo-metrics:${clientIp(request.headers)}`,
    30,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const supabase = await createServiceClient();

  // Five independent reads — issue them concurrently so endpoint latency is one
  // round-trip, not the sum of five.
  try {
    const [vendors, booths, orders, payments, pendingRes] = await Promise.all([
      readAllRows((from, to) =>
        supabase
          .from("vendors")
          .select("id, plan, created_at")
          .order("id")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        supabase
          .from("booths")
          .select("id, vendor_id")
          .order("id")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        supabase
          .from("orders")
          .select("booth_id, status, total_cents, created_at")
          .order("id")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        supabase
          .from("payments")
          .select("amount_cents, created_at")
          .order("id")
          .range(from, to),
      ),
      supabase
        .from("purchase_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    if (pendingRes.error)
      throw new Error("Could not read pending request count");

    const metrics = computeMerqoMetrics({
      nowMs: Date.now(),
      vendors: vendors as {
        id: string;
        plan: Plan;
        created_at: string;
      }[],
      booths: booths as { id: string; vendor_id: string }[],
      orders: orders as {
        booth_id: string;
        status: string;
        total_cents: number;
        created_at: string;
      }[],
      payments: payments as {
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
  } catch (error) {
    console.error("merqo metrics: read failed", error);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
}
