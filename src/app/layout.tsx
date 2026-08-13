import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
        {/* Applies the already-built `.dark` palette (see globals.css) from the
            OS/browser color-scheme preference, since this app has no manual
            theme toggle. `beforeInteractive` runs before hydration to avoid a
            flash of the wrong theme, and keeps listening so a mid-shift
            day→night switch (a real night-market scenario) updates the board
            live. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {"try{var m=window.matchMedia('(prefers-color-scheme: dark)');" +
            "var apply=function(e){document.documentElement.classList.toggle('dark',e.matches)};" +
            "apply(m);m.addEventListener('change',apply);}catch(e){}"}
        </Script>
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
