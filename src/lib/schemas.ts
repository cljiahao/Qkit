import { z } from "zod";
import type {
  MenuItem,
  OptionGroup,
  OrderItem,
  PaymentConfig,
} from "@/lib/types";
import type { BoothHours } from "@/lib/hours";

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
  // false/undefined = single-select; true = multi-select (checkbox).
  multiple: z.boolean().optional(),
  // A group with no choices can't be satisfied; drop it on read so it never
  // reaches the customizer (which would crash trying to resolve a default).
  choices: z.array(optionChoiceSchema).min(1),
});

/**
 * Drop half-filled option groups before validation/save: trim labels, remove
 * blank-label choices, then remove groups left with a blank label or no choices.
 * Returns undefined when nothing survives, so plain items carry no empty array.
 */
export function sanitizeOptionGroups(
  groups: OptionGroup[] | undefined,
): OptionGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  const cleaned = groups
    .map((g) => ({
      ...g,
      label: g.label.trim(),
      choices: g.choices
        .map((c) => ({ ...c, label: c.label.trim() }))
        .filter((c) => c.label.length > 0),
    }))
    .filter((g) => g.label.length > 0 && g.choices.length > 0);
  return cleaned.length ? cleaned : undefined;
}

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
  // Vendor's unit cost — drives margin stats. Never sent to customers.
  cost_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  // The menu editor builds these; sanitizeOptionGroups runs before save so a
  // half-filled group never reaches optionGroupSchema (choices.min(1)).
  option_groups: z.array(optionGroupSchema).optional(),
  available: z.boolean(),
  // Optional sold-out cap (Pro). null/absent = unlimited.
  stock: z.number().int().nonnegative().nullable().optional(),
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const dayWindowSchema = z.object({ open: hhmm, close: hhmm });

/**
 * Booth working hours (stored as JSONB). null = no restriction. Same schema
 * for read and write: tolerant in that an unparseable JSONB value falls back to
 * null via parseBoothHours, strict in that the editor must emit valid windows.
 */
export const boothHoursSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("daily"), open: hhmm, close: hhmm }),
    z.object({
      mode: z.literal("weekly"),
      days: z.object({
        mon: dayWindowSchema.nullable(),
        tue: dayWindowSchema.nullable(),
        wed: dayWindowSchema.nullable(),
        thu: dayWindowSchema.nullable(),
        fri: dayWindowSchema.nullable(),
        sat: dayWindowSchema.nullable(),
        sun: dayWindowSchema.nullable(),
      }),
    }),
  ])
  .nullable();

// ── Payment seam ─────────────────────────────────────────────────────────────
// booths.payment discriminated union. No secrets here — pointer URLs, static QR
// images, and PayNow identifiers are all shown to the paying customer.

const pointerConfigSchema = z.object({
  kind: z.literal("pointer"),
  label: z.string().min(1, "Label is required").max(60),
  // Rendered as an <a href> on the public status page — restrict to http(s) so
  // a vendor can't store a javascript:/data: link (stored XSS on the QKit origin).
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link")
    .optional(),
  qr_image_url: imageUrlString.optional(),
});

const paynowConfigSchema = z.object({
  kind: z.literal("paynow"),
  payee_name: z.string().min(1, "Payee name is required").max(100),
  // SG UEN: alphanumeric, ~9–10 chars. Mobile: +65 followed by 8 digits.
  uen: z
    .string()
    .regex(/^[0-9A-Za-z]{8,12}$/, "Invalid UEN")
    .optional(),
  mobile: z
    .string()
    .regex(/^\+65[0-9]{8}$/, "Use +65XXXXXXXX")
    .optional(),
});

const stripeConfigSchema = z.object({
  kind: z.literal("stripe"),
  account_id: z.string().min(1),
});

// Discriminated union over plain objects, then cross-field rules applied to the
// union (zod v3 discriminatedUnion rejects .refine()-wrapped members).
export const paymentConfigSchema = z
  .discriminatedUnion("kind", [
    pointerConfigSchema,
    paynowConfigSchema,
    stripeConfigSchema,
  ])
  .superRefine((c, ctx) => {
    if (c.kind === "pointer" && !c.url && !c.qr_image_url)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a payment link or a QR image",
        path: ["url"],
      });
    // PayNow targets exactly one of UEN or mobile (xor).
    if (c.kind === "paynow" && Boolean(c.uen) === Boolean(c.mobile))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a UEN or a mobile number, not both",
        path: ["uen"],
      });
  });
export type PaymentConfigInput = z.infer<typeof paymentConfigSchema>;

export const paymentStatusSchema = z.enum([
  "not_required",
  "pending",
  "claimed",
  "confirmed",
]);

/** Parse a JSONB booths.payment value; any malformed shape degrades to null. */
export function parsePaymentConfig(data: unknown): PaymentConfig | null {
  if (data == null) return null;
  const parsed = paymentConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export const boothFormSchema = z.object({
  boothId: z.string().uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: imageUrlString.nullable(),
  is_active: z.boolean(),
  hours: boothHoursSchema.default(null),
  menu_items: z.array(menuItemFormSchema),
  // Optional BYO payment method; null = queue-only. Reuses paymentConfigSchema.
  payment: paymentConfigSchema.nullable().default(null),
});

/** Parse a JSONB hours value; any malformed shape degrades to null (open). */
export function parseBoothHours(data: unknown): BoothHours {
  const parsed = boothHoursSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// ── Admin: pricing + license minting ─────────────────────────────────────────

export const pricingFormSchema = z.object({
  event_pass_cents: z.number().int().nonnegative().max(10_000_00),
  monthly_cents: z.number().int().nonnegative().max(10_000_00),
});
export type PricingFormInput = z.infer<typeof pricingFormSchema>;

export const grantPassSchema = z.object({
  vendorId: z.string().uuid(),
  // Sold per day; 1 covers a few-hour market, up to 14 for long bazaars/fairs.
  days: z.number().int().positive().max(14),
  // When the pass starts (ISO). Omitted = starts now. Lets a vendor schedule it
  // for their event date; entitlement is computed from [validFrom, expires_at).
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
  // What QKit actually collected (cents). 0/omitted = free comp / design partner.
  amountCents: z.number().int().nonnegative().max(10_000_00).optional(),
});
export type GrantPassInput = z.infer<typeof grantPassSchema>;

// ── In-product feedback ──────────────────────────────────────────────────────

export const feedbackSchema = z
  .object({
    source: z.enum(["customer", "vendor"]),
    boothId: z.string().uuid().optional(),
    orderNumber: z.string().max(40).optional(),
    rating: z.number().int().min(1).max(5).optional(), // customer order rating
    nps: z.number().int().min(0).max(10).optional(), // vendor → QKit loyalty
    message: z.string().trim().max(2000).optional(),
  })
  // Require at least a score (rating or NPS) or a non-empty message.
  .refine(
    (d) =>
      d.rating != null || d.nps != null || (d.message && d.message.length > 0),
    {
      message: "Add a rating or a message",
      path: ["message"],
    },
  );
export type FeedbackInput = z.infer<typeof feedbackSchema>;

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
  cost_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  available: z.boolean(),
  option_groups: z.array(optionGroupSchema).optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
});

export const orderItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price_cents: z.number().int().nonnegative().optional(),
  // Snapshotted from the menu at order time (server-side), for margin stats.
  cost_cents: z.number().int().nonnegative().optional(),
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
  payment_status: paymentStatusSchema,
  payment_method_kind: z
    .enum(["pointer", "paynow", "stripe"])
    .nullable()
    // Tolerant read: an unknown kind from an old/foreign row degrades to null
    // rather than dropping the whole realtime order.
    .catch(null),
  paid_at: z.string().nullable(),
  created_at: z.string(),
  ready_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  updated_at: z.string(),
  idempotency_key: z.string().nullable(),
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
