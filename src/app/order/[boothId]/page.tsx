import { notFound } from "next/navigation";
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
    .select("id, name, menu_items")
    .eq("id", boothId)
    .eq("is_active", true)
    .single();

  if (!booth) notFound();

  const available = parseMenuItems(booth.menu_items).filter((m) => m.available);

  return (
    <div className="min-h-screen max-w-lg mx-auto p-4">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">Order from</p>
        <h1 className="text-3xl font-bold">{booth.name}</h1>
      </header>
      <OrderForm boothId={booth.id} menuItems={available} />
    </div>
  );
}
