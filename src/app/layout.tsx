import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import { createServerClient } from "@/lib/supabase/server";
import { BRAND_EMBER } from "@/lib/brand-icon";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qkit | Live Queueing",
  description: "Scan, order, and track from any food booth in real time.",
  // iOS standalone PWA chrome (status bar + home-screen title).
  appleWebApp: { capable: true, title: "Qkit", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: BRAND_EMBER,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Anonymous-safe (same client shape as the public order page) — read errors
  // fail closed to "no banner" (DEFAULT_PLATFORM_SETTINGS) rather than
  // breaking every single page load site-wide over a display-only feature.
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("banner_enabled, banner_message")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error("platform_settings read failed", error.message);
  const banner = data ?? DEFAULT_PLATFORM_SETTINGS;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${hanken.variable} ${spaceMono.variable}`}
    >
      <body>
        <ServiceWorkerRegistrar />
        <MaintenanceBanner
          enabled={banner.banner_enabled}
          message={banner.banner_message}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
