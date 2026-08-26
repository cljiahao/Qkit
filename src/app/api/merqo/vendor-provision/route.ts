import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { provisionBearerOk } from "@/lib/merqo-auth";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";
import { recordAudit } from "@/lib/audit";

export const revalidate = 0;

const bodySchema = z.object({ user_id: z.string().uuid() });

export async function POST(request: Request) {
  if (!provisionBearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  const { user_id } = parsed.data;

  const supabase = await createServiceClient();

  const { error: insertError } = await supabase
    .from("vendors")
    .insert({ id: user_id });
  const alreadyExisted = insertError?.code === "23505";
  if (insertError && !alreadyExisted) {
    if (insertError.code === "23503") {
      return NextResponse.json({ error: "Unknown user_id" }, { status: 400 });
    }
    console.error("vendor-provision: insert failed", insertError.message);
    return NextResponse.json(
      { error: "Could not provision vendor" },
      { status: 500 },
    );
  }

  if (!alreadyExisted) {
    try {
      await getOrCreateVendorProfile(supabase, user_id, null);
    } catch (err) {
      console.error(
        "vendor-provision: profile seed failed",
        err instanceof Error ? err.message : err,
      );
      return NextResponse.json(
        { error: "Could not provision vendor" },
        { status: 500 },
      );
    }
  }

  const { data: vendorRow, error: readError } = await supabase
    .from("vendors")
    .select("plan")
    .eq("id", user_id)
    .maybeSingle();
  if (readError || !vendorRow) {
    console.error("vendor-provision: read-back failed", readError?.message);
    return NextResponse.json(
      { error: "Could not read vendor plan" },
      { status: 500 },
    );
  }

  // No signed-in admin here — admin_id is the vendor's own id (satisfies
  // the FK) and detail.actor marks this as merqo-, not vendor-, initiated.
  await recordAudit({
    admin_id: user_id,
    action: "merqo_vendor_provision",
    target_id: user_id,
    detail: {
      actor: "merqo_system",
      already_existed: alreadyExisted,
      plan: vendorRow.plan,
    },
  });

  return NextResponse.json({
    ok: true,
    already_existed: alreadyExisted,
    plan: vendorRow.plan,
  });
}
