import { notFound } from "next/navigation";
import { requireVendor } from "@/lib/supabase/get-vendor";
import { createServerClient } from "@/lib/supabase/server";
import { BoothQrPoster } from "./booth-qr-poster";

export const revalidate = 0;

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function BoothQrPage({ params }: Props) {
  const { boothId } = await params;
  await requireVendor();

  const supabase = await createServerClient();
  // RLS scopes this to the vendor's own booths; a foreign id returns null.
  const { data: booth } = await supabase
    .from("booths")
    .select("id, name, is_active, short_code")
    .eq("id", boothId)
    .maybeSingle();

  if (!booth) notFound();

  return (
    <BoothQrPoster
      boothId={booth.id}
      name={booth.name}
      isActive={booth.is_active}
      code={booth.short_code}
    />
  );
}
