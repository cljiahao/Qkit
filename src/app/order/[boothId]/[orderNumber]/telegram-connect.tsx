import { mintCustomerConnectToken } from "@/lib/merqo-customer-notify";

/**
 * Server component, same shape as EarnLink: mints a single-order-scoped
 * Telegram connect token from merqo and renders the deep-link button, or
 * `null` on any mint failure — a merqo outage must never break the
 * order-status page. The disclosure text below is a one-line preview only;
 * the full consent copy lives in merqo's own connect flow, never restated
 * or diverged from here.
 */
export async function TelegramConnect({
  orderId,
  vendorId,
}: {
  orderId: string;
  vendorId: string;
}) {
  const connect = await mintCustomerConnectToken(
    vendorId,
    "qkit",
    `qkit:${orderId}`,
  );
  if (!connect) return null;

  return (
    <div className="text-center">
      <a
        href={connect.deep_link}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Get notified on Telegram when it&apos;s ready →
      </a>
      <p className="mt-1 text-xs text-muted-foreground">
        Connects you to Merqo on Telegram — we&apos;ll message you here about
        your order, and about any Merqo kit you use going forward (never
        marketing, see merqo&apos;s disclosure page). You can block the bot any
        time.
      </p>
    </div>
  );
}
