import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  vendorName: z.string().min(1, 'Vendor name is required').max(100),
});

export const placeOrderSchema = z.object({
  customerName: z.string().min(1, 'Your name is required').max(100),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        name: z.string(),
        price_cents: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1, 'Add at least one item'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
