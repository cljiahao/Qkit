// Thin server-only HTTP client for printkit's /api/v1/print-jobs — mirrors
// src/lib/paykit/client.ts's shape almost exactly (same never-throw,
// discriminated-result pattern, same KIT_SLUG-not-an-env-var reasoning).
// Only one endpoint exists today (job creation); status changes flow the
// OTHER direction (printkit calls qkit's own /api/printkit/print-status —
// see src/lib/qkit-printkit-auth.ts and that route), so this client has no
// "get status" function — there's nothing here to poll.

import { z } from "zod";

const KIT_SLUG = "qkit";

export type PrintkitResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; error: string };

const createPrintJobResponseSchema = z.object({ id: z.string() });
const registerLocationResponseSchema = z.object({ id: z.string() });
const errorBodySchema = z.object({ error: z.string() });

export async function createPrintJob(args: {
  vendorId: string;
  orderId: string;
  boothId: string;
  customerName: string;
  orderNumber: string;
}): Promise<PrintkitResult<{ id: string }>> {
  const secret = process.env.PRINTKIT_KIT_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };
  }
  // No fallback URL: printkit has no live deployment yet (its own Plan 1
  // deliberately deferred Vercel/domain setup to a human, after review).
  // Guessing a *.vercel.app subdomain here would repeat the exact mistake
  // Plan 2's own printkit-side qkit-client.ts made and had to fix in its
  // final review — an unset env var must fail closed, never silently POST
  // a bearer secret to an unclaimed/wrong host.
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl) {
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(new URL("/api/v1/print-jobs", printkitUrl), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${KIT_SLUG}:${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vendor_id: args.vendorId,
        payload: {
          customer_name: args.customerName,
          order_number: args.orderNumber,
        },
        source_ref: args.orderId,
        location_ref: args.boothId,
      }),
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an invalid response",
      };
    }

    if (!res.ok) {
      const parsedError = errorBodySchema.safeParse(body);
      return {
        ok: false,
        status: res.status,
        error: parsedError.success
          ? parsedError.data.error
          : `printkit request failed (${res.status})`,
      };
    }

    const parsed = createPrintJobResponseSchema.safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an unexpected response",
      };
    }
    return { ok: true, data: { id: parsed.data.id } };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Could not reach printkit",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function registerPrintLocation(args: {
  vendorId: string;
  sourceRef: string;
  label: string;
  active: boolean;
}): Promise<PrintkitResult<{ id: string }>> {
  const secret = process.env.PRINTKIT_KIT_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };
  }
  const printkitUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;
  if (!printkitUrl) {
    return {
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(new URL("/api/v1/print-locations", printkitUrl), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${KIT_SLUG}:${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vendor_id: args.vendorId,
        source_ref: args.sourceRef,
        label: args.label,
        active: args.active,
      }),
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an invalid response",
      };
    }

    if (!res.ok) {
      const parsedError = errorBodySchema.safeParse(body);
      return {
        ok: false,
        status: res.status,
        error: parsedError.success
          ? parsedError.data.error
          : `printkit request failed (${res.status})`,
      };
    }

    const parsed = registerLocationResponseSchema.safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        status: res.status,
        error: "printkit returned an unexpected response",
      };
    }
    return { ok: true, data: { id: parsed.data.id } };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "Could not reach printkit",
    };
  } finally {
    clearTimeout(timer);
  }
}
