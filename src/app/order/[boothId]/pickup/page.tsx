import { notFound } from "next/navigation";
import { orderBoothIdSchema } from "@/lib/schemas";
import { PickupScanner } from "./pickup-scanner";

interface Props {
  params: Promise<{ boothId: string }>;
}

export const revalidate = 0;

/**
 * Public, unattended self-checkout pickup kiosk — see ./README.md. No login,
 * no per-order secret in the URL: authorization lives in the token the
 * scanned QR carries, checked by confirmCollection.
 */
export default async function PickupPage({ params }: Props) {
  const { boothId } = await params;
  if (!orderBoothIdSchema.safeParse(boothId).success) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <PickupScanner boothId={boothId} />
    </div>
  );
}
