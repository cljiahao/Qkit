import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { printkitCallbackBearerOk } from "@/lib/qkit-printkit-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["printed", "failed"]),
  attempt_at: z.string().datetime({ precision: 6 }),
});

export async function POST(request: Request) {
  if (!printkitCallbackBearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts abuse once compromised. Generous since
  // a busy vendor's bridge can legitimately fire several of these a minute.
  const allowed = await rateLimit(
    `printkit-print-status:${clientIp(request.headers)}`,
    60,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      print_status: parsed.data.status,
      print_status_updated_at: parsed.data.attempt_at,
    })
    .eq("id", parsed.data.order_id)
    // The validated canonical UTC grammar excludes filter punctuation.
    .or(
      [
        "print_status.in.(not_required,queued)",
        "print_status_updated_at.is.null",
        "print_status_updated_at.lt." + parsed.data.attempt_at,
        "and(print_status_updated_at.eq." +
          parsed.data.attempt_at +
          ",print_status.neq.printed)",
      ].join(","),
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      "printkit print-status callback: update failed",
      error.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  if (!data) {
    const { data: existing, error: readError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", parsed.data.order_id)
      .maybeSingle();
    if (readError)
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    if (!existing)
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    // Older or duplicate attempts are acknowledged without changing state.
    return NextResponse.json({ ok: true, stale: true });
  }

  return NextResponse.json({ ok: true });
}
