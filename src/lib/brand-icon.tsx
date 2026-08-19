import type { ReactElement } from "react";

// Market Ochre marks, approximated from the oklch tokens as hex (ImageResponse
// needs concrete CSS colours): saffron primary on chalk-cream paper.
export const BRAND_EMBER = "#b8862c";
export const BRAND_OAT = "#efe3c8";

/**
 * The qkit "Q" app mark for ImageResponse-generated icons (favicon, manifest,
 * apple-touch). A system serif stands in for Fraunces — fine at icon scale and
 * avoids shipping font data to the icon route.
 */
export function brandIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_EMBER,
        color: BRAND_OAT,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        borderRadius: size * 0.22,
      }}
    >
      Q
    </div>
  );
}
