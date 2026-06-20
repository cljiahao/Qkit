// Client-side resize + WebP encode before upload. Scaling a phone photo down to
// a sane max dimension is the biggest size win (a 4000px photo → 1600px drops
// ~84% of the pixels before compression), and WebP is ~25–35% smaller than JPEG
// at the same quality. Browser-only (Canvas) — call from client components.

export type ResizeResult = { blob: Blob; ext: string; type: string };

async function decode(file: File): Promise<ImageBitmap> {
  // `from-image` applies EXIF orientation so portrait phone photos aren't sideways.
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

/**
 * Resize `file` so its longest side is ≤ maxDim and re-encode as WebP. Returns
 * the original (as-is) if the browser can't decode/encode it, so upload never
 * hard-fails on an exotic image.
 */
export async function resizeToWebp(
  file: File,
  maxDim: number,
  quality = 0.82,
): Promise<ResizeResult> {
  try {
    const bitmap = await decode(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("encode failed");
    return { blob, ext: "webp", type: "image/webp" };
  } catch {
    // Fallback: upload the original untouched (keep its extension/type).
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return { blob: file, ext, type: file.type || "application/octet-stream" };
  }
}
