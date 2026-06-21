import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

export function GET() {
  return new ImageResponse(brandIcon(512), { width: 512, height: 512 });
}
