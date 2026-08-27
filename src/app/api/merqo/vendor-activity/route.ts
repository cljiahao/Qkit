import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  findAuthUserByEmail,
  listAllAuthUsers,
} from "@/lib/merqo-auth";
import { latestActivePassByVendor } from "@/lib/admin-stats";
import { computeVendorActivity } from "@/lib/merqo-vendor-activity";
import type { Plan } from "@/lib/types";

export const revalidate = 0;

const querySchema = z.object({ email: z.string().email() });

/**
 * merqo owns this table's real generated types — a hand-written mirror of
 * the support_messages row shape, not a generated type, since merqo.* is
 * outside qkit's own supabase gen types scope (schema: "qkit"). Mirrors the
 * pattern in admin/page.tsx and admin/vendors/[id]/page.tsx.
 */
type MerqoSupportMessagesSchema = {
  merqo: {
    Tables: {
      support_messages: {
        Row: { id: string; user_id: string; kit_slug: string; status: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const usersRes = await listAllAuthUsers(supabase, "merqo vendor-activity");
  if (usersRes.error) {
    console.error("merqo vendor-activity: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const user = findAuthUserByEmail(
    (usersRes.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
    })),
    parsed.data.email,
  );
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const vendorRes = await supabase
    .from("vendors")
    .select("id, plan, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (vendorRes.error) {
    console.error(
      "merqo vendor-activity: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendor = vendorRes.data;
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // merqo.support_messages' SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins/service-role scope alone — reuse the same
  // service-client-cast-to-the-merqo-schema pattern admin/page.tsx already
  // establishes rather than adding a second Supabase client.
  const merqoClient =
    supabase as unknown as SupabaseClient<MerqoSupportMessagesSchema>;

  const [boothsRes, licensesRes, messagesRes] = await Promise.all([
    supabase
      .from("booths")
      .select("id, vendor_id, created_at, is_active")
      .eq("vendor_id", vendor.id),
    supabase
      .from("licenses")
      .select("vendor_id, valid_from, expires_at")
      .eq("vendor_id", vendor.id),
    merqoClient
      .schema("merqo")
      .from("support_messages")
      .select("id, status")
      .eq("kit_slug", "qkit")
      .eq("user_id", vendor.id)
      .eq("status", "open"),
  ]);
  if (boothsRes.error || licensesRes.error || messagesRes.error) {
    console.error(
      "merqo vendor-activity: read failed",
      boothsRes.error?.message ??
        licensesRes.error?.message ??
        messagesRes.error?.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const booths = boothsRes.data ?? [];
  const boothIds = booths.map((b) => b.id);
  const ordersRes = boothIds.length
    ? await supabase
        .from("orders")
        .select("booth_id, status, total_cents, created_at")
        .in("booth_id", boothIds)
    : { data: [], error: null };
  if (ordersRes.error) {
    console.error(
      "merqo vendor-activity: read failed",
      ordersRes.error.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const nowMs = Date.now();
  const passExpiresAt =
    latestActivePassByVendor(licensesRes.data ?? [], nowMs).get(vendor.id) ??
    null;

  const payload = computeVendorActivity(
    vendor as { id: string; plan: Plan; created_at: string },
    booths,
    ordersRes.data ?? [],
    passExpiresAt,
    (messagesRes.data ?? []).length > 0,
    nowMs,
  );

  return NextResponse.json(payload);
}
