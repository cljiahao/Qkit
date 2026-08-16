type ConnectToken = { token: string; deep_link: string };

// Read lazily (not at module scope) so tests can set/override these per-case
// via process.env rather than baking a stale value in at import time.
function merqoBaseUrl(): string {
  return process.env.MERQO_BASE_URL ?? "https://merqo-sg.vercel.app";
}
function merqoCustomerSecret(): string {
  return process.env.MERQO_CUSTOMER_SECRET ?? "";
}

/**
 * Mints a short-lived Telegram connect-link token for one customer-facing
 * event via merqo's `POST /api/merqo/customer-connect-token`. Fails closed
 * (returns `null`) on any non-2xx response, timeout, or network error — a
 * merqo outage must never break the caller's own render/flow.
 */
export async function mintCustomerConnectToken(
  vendorId: string,
  kitSlug: string,
  notifyRef: string,
): Promise<ConnectToken | null> {
  try {
    const res = await fetch(
      `${merqoBaseUrl()}/api/merqo/customer-connect-token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${merqoCustomerSecret()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          vendor_id: vendorId,
          kit_slug: kitSlug,
          notify_ref: notifyRef,
        }),
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ConnectToken;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: notifies a customer via merqo's
 * `POST /api/merqo/notify-customer` (`notify_ref` mode). Never throws — a
 * non-2xx response or network error is caught and logged, never propagated,
 * same rule as every other Telegram integration point in this ecosystem
 * (callers must never have their own result changed by this).
 */
export async function notifyCustomer(
  vendorId: string,
  notifyRef: string,
  message: string,
): Promise<void> {
  try {
    const res = await fetch(`${merqoBaseUrl()}/api/merqo/notify-customer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${merqoCustomerSecret()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        vendor_id: vendorId,
        notify_ref: notifyRef,
        message,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error("notifyCustomer: non-2xx response", res.status);
    }
  } catch (err) {
    console.error("notifyCustomer failed", err);
  }
}
