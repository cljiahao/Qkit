const LOOPKIT_URL =
  process.env.NEXT_PUBLIC_LOOPKIT_URL ?? "https://loopkit-sg.vercel.app";
const MERQO_METRICS_SECRET = process.env.MERQO_METRICS_SECRET ?? "";

type EarnConfig = { enabled: boolean; program_name?: string };

async function fetchEarnConfig(vendorId: string): Promise<EarnConfig> {
  try {
    const res = await fetch(
      `${LOOPKIT_URL}/api/merqo/qkit-earn-config?vendor_id=${encodeURIComponent(vendorId)}`,
      {
        headers: { Authorization: `Bearer ${MERQO_METRICS_SECRET}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return { enabled: false };
    return (await res.json()) as EarnConfig;
  } catch {
    // Fail closed: never blocks the order page, the link just doesn't show.
    return { enabled: false };
  }
}

export async function EarnLink({
  orderId,
  vendorId,
  loopkitBaseUrl = LOOPKIT_URL,
}: {
  orderId: string;
  vendorId: string;
  loopkitBaseUrl?: string;
}) {
  const config = await fetchEarnConfig(vendorId);
  if (!config.enabled) return null;

  return (
    <a
      href={`${loopkitBaseUrl}/earn?order=${encodeURIComponent(orderId)}`}
      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Earn a stamp{config.program_name ? ` — ${config.program_name}` : ""} →
    </a>
  );
}
