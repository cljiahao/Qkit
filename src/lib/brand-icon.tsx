import type { ReactElement } from "react";

// Kraft & Ember marks, approximated from the oklch tokens as hex (ImageResponse
// needs concrete CSS colours): ember primary on warm oat.
export const BRAND_EMBER = "#c4572f";
export const BRAND_OAT = "#f6f1e7";

/**
 * The QKit "Q" app mark for ImageResponse-generated icons (favicon, manifest,
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
