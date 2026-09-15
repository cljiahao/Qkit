import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { printkitCallbackBearerOk } from "@/lib/qkit-printkit-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  order_id: z.string().uuid(),
  status: z.enum(["queued", "sent", "printed", "failed"]),
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
    supabase,
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
      print_status_updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.order_id)
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
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
