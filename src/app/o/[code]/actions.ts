"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import { logEvent } from "@/app/actions/events";
import { notifyVendor } from "@/lib/merqo-customer-notify";
import type { ActionResult } from "@/lib/action-result";

type Result = ActionResult<{
  orderNumber: string;
  boothId: string;
  accessToken: string;
}>;

const codeSchema = z.string().min(1).max(64);
const idemSchema = z.string().uuid();

// Map a place_order RAISE prefix to a customer-facing message.
function messageFor(raw: string): string {
  if (raw.includes("ORDER_EXPIRED"))
    return "This code expired — please rescan.";
  if (raw.includes("ORDER_UNSERVABLE"))
    return "This booth isn't taking orders right now";
  if (raw.includes("ORDER_SOLD_OUT") || raw.includes("ORDER_ITEM_UNAVAILABLE"))
    return "Sorry — an item just sold out. Please adjust your order.";
  if (raw.includes("ORDER_RATE_LIMITED"))
    return "Too many orders too fast — wait a moment and try again.";
  return "Could not place order. Please try again.";
}

/**
 * Redundant new-order channel: alerts the booth's vendor via merqo's shared
 * Telegram bot (Phase A2 — supersedes qkit's own now-retired bot). Entirely
 * best-effort — the booth lookup reads via the service-role client (this
 * runs with no vendor session at all) and the whole thing is wrapped so
 * nothing here can ever affect placeOrder's own returned result. See
 * docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md.
 */
async function notifyVendorTelegram(
  boothId: string,
  orderNumber: string,
): Promise<void> {
  try {
    const service = await createServiceClient();

    const { data: booth } = await service
      .from("booths")
      .select("vendor_id")
      .eq("id", boothId)
      .maybeSingle();
    if (!booth) return;

    const { data: order } = await service
      .from("orders")
      .select("total_cents")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .maybeSingle();
    const totalLabel = order
      ? ` — $${(order.total_cents / 100).toFixed(2)}`
      : "";

    await notifyVendor(
      booth.vendor_id,
      `New order #${orderNumber}${totalLabel}`,
    );
  } catch (err) {
    console.error("notifyVendorTelegram failed", err);
  }
}

/**
 * Fires a printkit job-creation call for this order — best-effort, same
 * never-affects-the-result contract as notifyVendorTelegram above. Does its
 * own orders.id lookup: place_order's RPC output has no order id (only
 * order_number/booth_id/access_token — see
 * supabase/migrations/0075_place_order_customer_phone.sql), and printkit's
 * print_jobs.source_ref needs the real id (globally unique), not
 * order_number (only unique per booth_id). printkit itself decides whether
 * this vendor actually has a bridge configured; qkit doesn't ask.
 *
 * On a successful job creation, also marks this order's own print_status
 * 'queued' — without this, print_status stays 'not_required' for the
 * entire in-flight window (printkit only calls back on a TERMINAL status,
 * printed/failed — see Task 3's updatePrintJobStatus), which would make
 * the column lie about a job that's genuinely in progress. Best-effort,
 * same fire-and-forget contract as the createPrintJob call itself.
 */
async function notifyPrintkit(
  boothId: string,
  orderNumber: string,
  customerName: string,
): Promise<void> {
  try {
    const service = await createServiceClient();
    const { data: booth } = await service
      .from("booths")
      .select("vendor_id")
      .eq("id", boothId)
      .maybeSingle();
    if (!booth) return;

    const { data: order } = await service
      .from("orders")
      .select("id")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (!order) return;

    const { createPrintJob } = await import("@/lib/printkit/client");
    const result = await createPrintJob({
      vendorId: booth.vendor_id,
      orderId: order.id,
      customerName,
      orderNumber,
    });

    if (result.ok) {
      await service
        .from("orders")
        .update({
          print_status: "queued",
          print_status_updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }
  } catch (err) {
    console.error("notifyPrintkit failed", err);
  }
}

export async function placeOrder(
  code: string,
  input: PlaceOrderInput,
  idempotencyKey: string,
): Promise<Result> {
  if (!codeSchema.safeParse(code).success)
    return { success: false, error: "This code expired — please rescan." };
  if (!idemSchema.safeParse(idempotencyKey).success)
    return { success: false, error: "Invalid request" };
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: "Invalid order details" };

  const supabase = await createServerClient();

  // Anti-flood (best-effort). Fails open. This
  // is the honest-path per-IP guard; place_order also carries a booth-scoped
  // limiter so a direct RPC call that skips this action is still bounded.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(supabase, `order:${code}:${ip}`, 8, 60);
  if (!allowed)
    return {
      success: false,
      error: "Too many orders too fast — wait a moment and try again.",
    };

  // Blank ("" or whitespace-only, from a field left empty) is treated the same
  // as omitted — both skip the merqo.customers write. See placeOrderSchema's
  // customerPhone comment for why this normalization lives here, not in the
  // schema itself.
  const phone =
    parsed.data.customerPhone && parsed.data.customerPhone.length > 0
      ? parsed.data.customerPhone
      : undefined;

  const { data, error } = await supabase.rpc("place_order", {
    p_short_code: code,
    p_customer_name: parsed.data.customerName,
    p_items: parsed.data.items,
    p_idempotency_key: idempotencyKey,
    p_customer_phone: phone,
  });
  if (error) {
    const message = messageFor(error.message);
    // Log only unexpected failures (those that fall through to the generic
    // message). Known business raises — sold out, expired, unservable, rate
    // limited — are normal outcomes, not bugs, so they'd only be log noise.
    if (message === "Could not place order. Please try again.")
      console.error("placeOrder failed", error.message);
    return { success: false, error: message };
  }
  const out = z
    .object({
      order_number: z.string(),
      booth_id: z.string(),
      access_token: z.string(),
    })
    .safeParse(data);
  if (!out.success) {
    // The RPC succeeded but returned an unexpected shape — a real bug worth a log.
    console.error("placeOrder: malformed RPC output", JSON.stringify(data));
    return {
      success: false,
      error: "Could not place order. Please try again.",
    };
  }
  // Funnel: an order landed. Paired with booth_view (QR landing) to measure
  // scan→order conversion. logEvent is best-effort and never throws, so awaiting
  // it can't fail a placed order.
  await logEvent("order_placed", { boothId: out.data.booth_id });

  // Redundant vendor alert channel — same fire-and-forget contract as
  // logEvent above, never throws, never affects the result below.
  await notifyVendorTelegram(out.data.booth_id, out.data.order_number);

  // Printing job — same fire-and-forget contract.
  await notifyPrintkit(
    out.data.booth_id,
    out.data.order_number,
    parsed.data.customerName,
  );

  return {
    success: true,
    orderNumber: out.data.order_number,
    boothId: out.data.booth_id,
    accessToken: out.data.access_token,
  };
}
