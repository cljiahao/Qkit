import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ boothId: string }>;
}

const boothIdSchema = z.string().uuid();

// Compatibility shim. Phase A moved the customer entry route to /o/{short_code},
// but three callers only know the booth id: the reorder button, the status
// page's "Order again" link, and any previously shared/printed /order/{boothId}
// URL. Resolve the booth's CURRENT short code and redirect — so old links keep
// working and the reorder handoff (sessionStorage keyed by boothId, read on the
// menu page) survives the hop. Service client: the customer is anonymous and
// anon can no longer read booths directly (0029/0033).
export default async function OrderBoothRedirect({ params }: Props) {
  const { boothId } = await params;
  if (!boothIdSchema.safeParse(boothId).success) notFound();

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("booths")
    .select("short_code")
    .eq("id", boothId)
    .single();

  if (!data?.short_code) notFound();
  redirect(`/o/${data.short_code}`);
}
