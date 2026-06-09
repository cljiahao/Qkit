import { notFound } from "next/navigation";
import { MediaImage } from "@/components/media-image";
import { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { OrderForm } from "./order-form";

interface Props {
  params: Promise<{ boothId: string }>;
}

export default async function OrderPage({ params }: Props) {
  const { boothId } = await params;
  const supabase = await createServerClient();

  const { data: booth } = await supabase
    .from("booths")
    .select("id, name, image_url, menu_items")
    .eq("id", boothId)
    .eq("is_active", true)
    .single();

  if (!booth) notFound();

  const available = parseMenuItems(booth.menu_items).filter((m) => m.available);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-28 pt-8">
      {booth.image_url && (
        <div className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-border">
          <MediaImage
            src={booth.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-cover"
          />
        </div>
      )}
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Order from
        </p>
        <h1 className="font-display mt-1 text-4xl font-semibold leading-[1.05]">
          {booth.name}
        </h1>
      </header>
      <OrderForm boothId={booth.id} menuItems={available} />
    </div>
  );
}
