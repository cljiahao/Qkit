"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { MediaImage } from "@/components/media-image";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface Props {
  vendorId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  variant?: "banner" | "thumb";
}

export function ImageUploader({
  vendorId,
  value,
  onChange,
  variant = "banner",
}: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const box = variant === "thumb" ? "size-20 shrink-0" : "h-40 w-full";

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 2 MB or smaller");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${vendorId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("booth-images")
      .upload(path, file, { upsert: false });

    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("booth-images").getPublicUrl(path);
    onChange(publicUrl);
    setUploading(false);
  }

  if (value) {
    return (
      <div
        className={`relative overflow-hidden rounded-xl border border-border ${box}`}
      >
        <MediaImage
          src={value}
          alt=""
          fill
          sizes={
            variant === "thumb" ? "5rem" : "(max-width: 640px) 100vw, 28rem"
          }
          className="object-cover"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
          aria-label="Remove image"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60 ${box}`}
    >
      {uploading ? (
        <Loader2
          className={
            variant === "thumb" ? "size-4 animate-spin" : "size-6 animate-spin"
          }
        />
      ) : (
        <ImagePlus className={variant === "thumb" ? "size-4" : "size-6"} />
      )}
      {variant === "banner" && (
        <>
          <span className="text-sm font-medium">
            {uploading ? "Uploading…" : "Add a booth banner"}
          </span>
          <span className="text-xs">JPEG, PNG, or WebP · up to 2 MB</span>
        </>
      )}
      {variant === "thumb" && (
        <span className="text-[10px] font-medium leading-tight">
          {uploading ? "…" : "Photo"}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </button>
  );
}
