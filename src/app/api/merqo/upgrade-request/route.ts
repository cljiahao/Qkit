import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveUpgradeOutcome } from "@/lib/merqo-upgrade-request";

export const revalidate = 0;

// Verbatim copy of api/merqo/metrics/route.ts's bearerOk — keep in lockstep.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  // never allow an unset secret to authorize
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  // Constant-time compare so the endpoint doesn't leak the secret one byte at a
  // time via response timing. timingSafeEqual requires equal-length buffers, so
  // gate on length first (length is not itself sensitive here).
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    console.error("merqo upgrade-request: read failed", usersRes.error.message);
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const key = parsed.data.email.toLowerCase();
  const authUser = (usersRes.data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === key,
  );

  const vendorRes = authUser
    ? await supabase
        .from("vendors")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;

  const pendingRes = vendorId
    ? await supabase
        .from("purchase_requests")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("kind", "monthly")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()
    : null;
  if (pendingRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      pendingRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const outcome = resolveUpgradeOutcome(vendorId !== null, !!pendingRes?.data);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_pending") {
    return NextResponse.json({ success: true });
  }

  const insertRes = await supabase
    .from("purchase_requests")
    .insert({ vendor_id: vendorId!, kind: "monthly" });
  if (insertRes.error) {
    console.error(
      "merqo upgrade-request: insert failed",
      insertRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
