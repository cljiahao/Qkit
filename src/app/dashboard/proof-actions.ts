"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

// Both queries run on the authenticated client, not service-role — RLS's
// existing orders_vendor_select policy and the payment_proofs_vendor_select
// storage policy (migration 0087) already scope both reads to the caller's
// own vendor, so no extra vendor check is needed here.

export async function getProofPhotoUrl(
  orderId: string,
): Promise<string | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_path")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_path) return null;

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(order.payment_proof_path, 300);
  if (error || !data) {
    console.error("getProofPhotoUrl failed", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function findDuplicateProofOrder(
  orderId: string,
): Promise<string | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const supabase = await createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("payment_proof_hash")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.payment_proof_hash) return null;

  const { data: match } = await supabase
    .from("orders")
    .select("order_number")
    .eq("payment_proof_hash", order.payment_proof_hash)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();

  return match?.order_number ?? null;
}
