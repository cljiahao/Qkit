import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveDowngradeOutcome } from "@/lib/merqo-downgrade-request";

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

  // Known limitation: listUsers paginates but we only fetch page 1 (1000 users max).
  // Once qkit has >1000 auth users, vendors past this page silently resolve as
  // not_found. TODO: implement pagination to fetch all pages.
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    console.error(
      "merqo downgrade-request: read failed",
      usersRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  if (usersRes.data?.users.length === 1000) {
    console.error(
      "merqo downgrade-request: listUsers returned a full page (1000) — pagination not implemented, some vendors past this page may resolve as not_found",
    );
  }

  const key = parsed.data.email.toLowerCase();
  const authUser = (usersRes.data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === key,
  );

  const vendorRes = authUser
    ? await supabase
        .from("vendors")
        .select("id, plan")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo downgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;
  const currentPlan = vendorRes?.data?.plan ?? "free";

  const outcome = resolveDowngradeOutcome(vendorId !== null, currentPlan);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_free") {
    return NextResponse.json({ success: true });
  }

  if (vendorId === null) {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }

  const updateRes = await supabase
    .from("vendors")
    .update({ plan: "free" })
    .eq("id", vendorId);
  if (updateRes.error) {
    console.error(
      "merqo downgrade-request: update failed",
      updateRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  // Clear any stale pending monthly request — best-effort, does not fail
  // the downgrade (the plan flip is the operation that matters).
  const clearRes = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("vendor_id", vendorId)
    .eq("kind", "monthly")
    .eq("status", "pending");
  if (clearRes.error) {
    console.error(
      "merqo downgrade-request: clearing pending requests failed",
      clearRes.error.message,
    );
  }

  return NextResponse.json({ success: true });
}
