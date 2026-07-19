"use server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems, parsePaymentConfig } from "@/lib/schemas";
import { parseRemaining } from "@/lib/stock";
import type { MenuItem, PaymentKind } from "@/lib/types";
import type { Remaining } from "@/lib/stock";

const boothIdSchema = z.string().uuid();

// Same rule place_walkup_order (migration 0061) applies server-side: a
// booth "expects payment" only for a live, non-stripe config. stripe is
// reserved but dark — treated the same as no payment config at all.
function expectsPaymentFor(kind: PaymentKind | null): boolean {
  return kind !== null && kind !== "stripe";
}

/**
 * The menu + live stock for one of the caller's own booths, for the walk-up
 * order sheet. Mirrors o/[code]/page.tsx's read shape (unfiltered menu items:
 * an "unavailable" item is rejected server-side by place_walkup_order, not
 * hidden client-side, same as the customer flow) but scoped by RLS to the
 * vendor's own booth instead of a public short_code lookup. Also surfaces
 * whether the booth expects payment, so the dialog can offer a "collected at
 * counter" toggle instead of always leaving a walk-up order pending payment.
 */
export async function getWalkupMenu(boothId: string): Promise<{
  menuItems: MenuItem[];
  remaining: Remaining;
  expectsPayment: boolean;
  paymentKind: PaymentKind | null;
} | null> {
  if (!boothIdSchema.safeParse(boothId).success) return null;

  const supabase = await createServerClient();
  // RLS (booths_vendor_all) scopes this to the caller's own booths; a
  // foreign or nonexistent id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select("id, menu_items, payment")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth) return null;

  const { data: remainingData } = await supabase.rpc("booth_remaining_stock", {
    p_booth_id: boothId,
  });

  const paymentKind = parsePaymentConfig(booth.payment)?.kind ?? null;

  return {
    menuItems: parseMenuItems(booth.menu_items),
    remaining: parseRemaining(remainingData),
    expectsPayment: expectsPaymentFor(paymentKind),
    paymentKind,
  };
}
