import type { createServiceClient } from "@/lib/supabase/server";
import { displayOrderNumber } from "@/lib/orders";
import { boardSettingsSchema } from "@/lib/schemas";
import { sgtStartOfDayIso } from "@/lib/tz";

type Client = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * The booth's first order_number of the SGT day, or null when it has had no
 * order yet today. This is the baseline `displayOrderNumber` ranks against
 * when a vendor has daily numbering on.
 *
 * One query, shared by every server path that shows a ticket number for a
 * single booth (the customer's status page, the TV display, the printed
 * label, the Telegram alert), so they cannot drift apart. The order board
 * reads many booths at once and has its own query.
 */
export async function firstOrderNumberToday(
  client: Client,
  boothId: string,
): Promise<string | null> {
  const { data } = await client
    .from("orders")
    .select("order_number")
    .eq("booth_id", boothId)
    .gte("created_at", sgtStartOfDayIso())
    .order("order_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.order_number ?? null;
}

/**
 * The number staff and the customer see for this order: the day's rank when
 * the vendor has board_settings.daily_order_number_reset on, the permanent
 * order_number otherwise. Anything that names an order to the vendor from
 * the server has to go through this, or it names a number nobody is looking
 * at.
 */
export async function vendorFacingOrderNumber(
  client: Client,
  vendorId: string,
  boothId: string,
  orderNumber: string,
): Promise<string> {
  const { data: vendor } = await client
    .from("vendors")
    .select("board_settings")
    .eq("id", vendorId)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  if (!settings.success || !settings.data.daily_order_number_reset)
    return orderNumber;

  return displayOrderNumber(
    orderNumber,
    await firstOrderNumberToday(client, boothId),
  );
}
