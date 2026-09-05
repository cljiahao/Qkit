import { redirect } from "next/navigation";
import { isLegalCurrent, LEGAL_VERSIONS } from "@merqo/ui";
import { createServiceClient } from "@/lib/supabase/server";

const TTL_MS = 5 * 60 * 1000;

function merqoBaseUrl(): string {
  return process.env.MERQO_BASE_URL ?? "https://merqo-sg.vercel.app";
}

/**
 * Is this vendor's terms + privacy acceptance current with the versions
 * @merqo/ui's LEGAL_VERSIONS requires?
 *
 * qkit does not own the acceptance record — merqo does — so the real check is
 * an HTTP call to merqo's GET /api/merqo/legal-status. That runs on every
 * gated dashboard render, so the result is cached in qkit.legal_check_state
 * for a short TTL, mirroring merqo's own vendor_sync_state throttle pattern.
 *
 * Fails closed: a missing secret, an unreachable merqo, a non-2xx response, or
 * a malformed body all resolve to `false` ("not current"), which routes the
 * vendor to /legal/accept rather than silently letting them past the gate.
 */
export async function checkLegalAcceptance(email: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  const supabase = await createServiceClient();

  const { data: cached } = await supabase
    .from("legal_check_state")
    .select("checked_at, is_current")
    .eq("email", normalized)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.checked_at).getTime() < TTL_MS) {
    return cached.is_current;
  }

  const secret = process.env.MERQO_CUSTOMER_SECRET;
  if (!secret) return false;

  let isCurrent = false;
  try {
    const url = new URL("/api/merqo/legal-status", merqoBaseUrl());
    url.searchParams.set("email", normalized);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const status = (await res.json()) as {
        terms: string | null;
        privacy: string | null;
      };
      isCurrent = isLegalCurrent(status, LEGAL_VERSIONS);
    }
  } catch (err) {
    console.error("checkLegalAcceptance: merqo legal-status call failed", err);
    return false;
  }

  await supabase.from("legal_check_state").upsert({
    email: normalized,
    checked_at: new Date().toISOString(),
    is_current: isCurrent,
  });

  return isCurrent;
}

/**
 * Page/layout guard companion to the auth-gate helpers: bounce a signed-in
 * vendor with a stale or missing legal acceptance to the /legal/accept
 * interstitial. Called at the same point unauthenticated users are sent to
 * /login. A no-op when `email` is falsy (the caller has already handled the
 * no-session case) so it never runs after that redirect has fired.
 */
export async function requireCurrentLegalAcceptance(
  email: string | undefined | null,
): Promise<void> {
  if (email && !(await checkLegalAcceptance(email))) {
    redirect("/legal/accept");
  }
}
