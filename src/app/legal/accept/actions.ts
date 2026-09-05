"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getLegalDocSource, LEGAL_VERSIONS } from "@merqo/ui";

const DOC_TYPES = ["terms", "privacy"] as const;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function merqoBaseUrl(): string {
  return process.env.MERQO_BASE_URL ?? "https://merqo-sg.vercel.app";
}

/**
 * Records the signed-in vendor's terms + privacy acceptance with merqo (the
 * owner of the acceptance record — qkit has no local table for it) via
 * `POST /api/merqo/legal-accept`, then sends them on to `next`.
 *
 * Each doc type is posted independently: merqo's endpoint tolerates a
 * duplicate `(vendor_email, doc_type, doc_version)` (Postgres 23505 — this
 * version was already accepted, e.g. a double submit, or the vendor is
 * current on one doc but not the other since the two versions bump
 * independently) as success, so a conflict on one never blocks the other.
 *
 * On success the local `legal_check_state` TTL cache is primed to
 * `is_current = true` so the very next gated render doesn't re-hit merqo.
 */
export async function acceptLegalTerms(formData: FormData): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect("/login");
    return;
  }

  const email = user.email.toLowerCase();
  const secret = process.env.MERQO_CUSTOMER_SECRET;
  if (!secret) {
    throw new Error("MERQO_CUSTOMER_SECRET is not configured");
  }

  for (const docType of DOC_TYPES) {
    const res = await fetch(`${merqoBaseUrl()}/api/merqo/legal-accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        vendor_email: email,
        auth_uid: user.id,
        doc_type: docType,
        doc_version: LEGAL_VERSIONS[docType],
        doc_sha256: sha256(getLegalDocSource(docType)),
        kit_slug: "qkit",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(
        `legal-accept (${docType}) failed: merqo responded ${res.status}`,
      );
    }
  }

  const service = await createServiceClient();
  await service.from("legal_check_state").upsert({
    email,
    checked_at: new Date().toISOString(),
    is_current: true,
  });

  redirect(safeRedirectPath(String(formData.get("next") || ""), "/dashboard"));
}
