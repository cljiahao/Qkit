"use client";

import Link from "next/link";
import { MediaImage } from "@/components/media-image";
import { toast } from "sonner";
import { Copy, Pencil, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BoothRow {
  id: string;
  name: string;
  is_active: boolean;
  image_url: string | null;
  itemCount: number;
}

export function BoothList({ booths }: { booths: BoothRow[] }) {
  async function copyLink(id: string) {
    const url = `${window.location.origin}/order/${id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Order link copied");
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {booths.map((booth) => (
        <div
          key={booth.id}
          className="ticket flex flex-col overflow-hidden rounded-xl border border-border"
        >
          <div className="relative h-28 w-full bg-muted">
            {booth.image_url && (
              <MediaImage
                src={booth.image_url}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 20rem"
                className="object-cover"
              />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg font-semibold leading-tight">
                {booth.name}
              </p>
              <span
                className={`mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                  booth.is_active
                    ? "text-status-ready"
                    : "text-muted-foreground"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {booth.is_active ? "Active" : "Off"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {booth.itemCount} item{booth.itemCount === 1 ? "" : "s"}
            </p>
            <div className="mt-auto flex gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="flex-1 rounded-lg"
              >
                <Link href={`/dashboard/booths/${booth.id}`}>
                  <Pencil className="size-3.5" /> Edit
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-lg"
                aria-label="Booth QR code"
              >
                <Link href={`/dashboard/booths/${booth.id}/qr`}>
                  <QrCode className="size-3.5" />
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => copyLink(booth.id)}
                aria-label="Copy order link"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
