import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand-icon";

// Stable-URL PNG for the web manifest (the generated app-dir icon URLs carry a
// hash, which can't be referenced from manifest.ts).
export function GET() {
  return new ImageResponse(brandIcon(192), { width: 192, height: 192 });
}
