"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { MediaImage } from "@/components/media-image";

interface Props {
  src: string;
  alt: string;
  sizes?: string;
}

/**
 * A menu photo that opens fullscreen on tap. The corner expand icon +
 * zoom-in cursor are the affordance that it's enlargeable; tap the backdrop or
 * press Escape to close.
 */
export function ZoomableImage({ src, alt, sizes }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    // no scroll behind the lightbox
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge photo of ${alt || "this item"}`}
        className="group absolute inset-0 cursor-zoom-in"
      >
        <MediaImage
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? "4rem"}
          className="object-cover"
        />
        <span className="absolute right-1 top-1 rounded-md bg-background/70 p-0.5 text-foreground/80 opacity-90 shadow-sm backdrop-blur-sm transition group-hover:opacity-100">
          <Maximize2 className="size-3" />
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Enlarged photo"}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          <div
            className="relative h-[80vh] w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <MediaImage
              src={src}
              alt={alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
