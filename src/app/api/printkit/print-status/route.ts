import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { printkitCallbackBearerOk } from "@/lib/qkit-printkit-auth";

export const revalidate = 0;

const bodySchema = z.object({
  order_id: z.string(),
  status: z.enum(["queued", "sent", "printed", "failed"]),
});

export async function POST(request: Request) {
  if (!printkitCallbackBearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("orders")
    .update({
      print_status: parsed.data.status,
      print_status_updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.order_id);

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

  return NextResponse.json({ ok: true });
}
