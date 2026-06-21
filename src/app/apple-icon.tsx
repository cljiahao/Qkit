import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

// 180×180 is Apple's home-screen touch-icon size.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(brandIcon(180), { ...size });
}
