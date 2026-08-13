// Rasterizes an inline SVG (the QR react-qr-code renders) to a PNG Blob —
// PNG rather than SVG because a phone's "scan from gallery"/photo-picker
// flow expects a raster photo, and the Web Share API's "Save Image" sheet
// only recognizes raster image types.
export async function renderSvgToPngBlob(
  svg: SVGSVGElement,
  size = 512,
): Promise<Blob> {
  const svgMarkup = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Timed out loading the QR image"));
      }, 5000);
      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("Could not render QR image"));
      };
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported");
    // White background — the QR SVG itself has no fill behind its modules.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    // Inset the QR so a real quiet zone (white border) survives in the
    // rasterized PNG — react-qr-code's serialized SVG has zero margin, and
    // strict decoders (bank apps scanning from a saved photo) can fail to
    // read a QR with modules running edge-to-edge. ~8% per side is roughly
    // the standard 4-module quiet zone for typical PayNow payload sizes.
    const pad = Math.round(size * 0.08);
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) throw new Error("Could not export QR image");
    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
