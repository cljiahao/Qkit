import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Don't advertise the framework (drops the X-Powered-By: Next.js header).
  poweredByHeader: false,
  // Dev-only badge (route/build status, bottom-left) — no effect in production
  // builds either way, but it shows up in screen recordings taken against a
  // dev server, so keep it off entirely.
  devIndicators: false,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },

  async headers() {
    // Client-side Supabase calls (auth, realtime) go straight from the
    // browser to Supabase, so connect-src must allow it. In dev that's local
    // Supabase over plain http/ws (127.0.0.1:54321); in prod it's the hosted
    // *.supabase.co over https/wss. Keeping the dev-only entries out of the
    // production policy avoids widening it beyond what's actually needed.
    const connectSrc =
      process.env.NODE_ENV === "production"
        ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
        : "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321";

    // Avatars/menu photos render as plain <img> tags (shadcn's Avatar, and any
    // remote image not routed through next/image), so the actual storage
    // origins from images.remotePatterns above need to be reachable directly —
    // not just same-origin — or the browser silently blocks the request and
    // Avatar falls back to initials as if the photo didn't exist.
    const imgSrc =
      process.env.NODE_ENV === "production"
        ? "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com"
        : "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com http://127.0.0.1:54321";

    // React's dev mode calls eval() to reconstruct stack traces across the
    // RSC boundary — harmless and dev-only ("React will never use eval() in
    // production mode", per the console message itself), but blocking it
    // spams console.error on every navigation and can trip Next's dev error
    // overlay into a full-page portal that eats every click. Production
    // never needs 'unsafe-eval'.
    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // No nonces: Next's own RSC-hydration <script> tags aren't
            // nonce-stamped in this setup (verified against a real build —
            // a nonce + 'strict-dynamic' policy blocked every script,
            // including Next's own, and the app never hydrated). 'unsafe-inline'
            // still blocks loading scripts/styles from foreign origins, which
            // covers the common supply-chain/injected-script attack; it does
            // not stop an inline payload from an XSS bug, but this app has no
            // dangerouslySetInnerHTML anywhere, so React's own escaping is
            // already the primary defense there.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              imgSrc,
              "font-src 'self' data:",
              connectSrc,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
