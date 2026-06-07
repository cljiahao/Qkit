import { z } from "zod";
import type { MenuItem, OrderItem } from "@/lib/types";

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  vendorName: z.string().min(1, "Vendor name is required").max(100),
});

export const placeOrderSchema = z.object({
  customerName: z.string().min(1, "Your name is required").max(100),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        name: z.string(),
        price_cents: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1, "Add at least one item"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

// ── Stored-JSONB read schemas ────────────────────────────────────────────────
// `booths.menu_items` and `orders.items` are JSONB (typed `Json`). Parse them at
// read boundaries instead of casting. Read schemas are tolerant (no upper bounds)
// — placeOrderSchema above stays strict for the write boundary.

export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_cents: z.number().int().nonnegative(),
  available: z.boolean(),
});

export const orderItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price_cents: z.number().int().nonnegative(),
  quantity: z.number().int().min(1),
});

export const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

/** Full `orders` row — validates untrusted realtime payloads before use. */
export const orderRowSchema = z.object({
  id: z.string(),
  booth_id: z.string(),
  order_number: z.string(),
  customer_name: z.string(),
  items: z.array(orderItemSchema),
  status: orderStatusSchema,
  total_cents: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Parse a JSONB menu_items value, dropping any malformed entries. */
export function parseMenuItems(data: unknown): MenuItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const parsed = menuItemSchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Parse a JSONB order items value, dropping any malformed entries. */
export function parseOrderItems(data: unknown): OrderItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const parsed = orderItemSchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}
