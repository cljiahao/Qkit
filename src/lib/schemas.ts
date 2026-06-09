import { z } from "zod";
import type { MenuItem, OrderItem } from "@/lib/types";

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const vendorSchema = z.object({
  name: z.string().min(1, "Stall name is required").max(100),
});

// Images come from two sources: the uploader (absolute Supabase URL) and seeded
// art (relative `/seed/...` path). z.string().url() rejects the latter, so accept
// either an http(s) URL or a leading-slash local path. Shared by booth banners
// (nullable, required key) and menu-item photos (also optional).
const imageUrlString = z
  .string()
  .refine((s) => /^https?:\/\//.test(s) || s.startsWith("/"), {
    message: "Must be a URL or a local path",
  });
const menuImageUrl = imageUrlString.nullable().optional();

export const optionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const optionGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  // A group with no choices can't be satisfied; drop it on read so it never
  // reaches the customizer (which would crash trying to resolve a default).
  choices: z.array(optionChoiceSchema).min(1),
});

export const selectedOptionSchema = z.object({
  group: z.string().min(1).max(100),
  choice: z.string().min(1).max(100),
});

export const placeOrderSchema = z.object({
  customerName: z.string().min(1, "Your name is required").max(100),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        name: z.string(),
        price_cents: z.number().int().nonnegative().optional(),
        quantity: z.number().int().min(1).max(20),
        options: z.array(selectedOptionSchema).max(20).optional(),
      }),
    )
    .min(1, "Add at least one item"),
});

export const menuItemFormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(500).default(""),
  price_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  // Pass-through: the booth editor doesn't edit option groups, but it must not
  // strip them from seeded items when a vendor saves the booth.
  option_groups: z.array(optionGroupSchema).optional(),
  available: z.boolean(),
});

export const boothFormSchema = z.object({
  boothId: z.string().uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: imageUrlString.nullable(),
  is_active: z.boolean(),
  menu_items: z.array(menuItemFormSchema),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type MenuItemFormInput = z.infer<typeof menuItemFormSchema>;
export type BoothFormInput = z.infer<typeof boothFormSchema>;

// ── Stored-JSONB read schemas ────────────────────────────────────────────────
// `booths.menu_items` and `orders.items` are JSONB (typed `Json`). Parse them at
// read boundaries instead of casting. Read schemas are tolerant (no upper bounds)
// — placeOrderSchema above stays strict for the write boundary.

export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  available: z.boolean(),
  option_groups: z.array(optionGroupSchema).optional(),
});

export const orderItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price_cents: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(1),
  options: z.array(selectedOptionSchema).optional(),
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
