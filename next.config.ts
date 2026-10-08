import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid advertising the framework in response headers.
  poweredByHeader: false,
  // Keep the development badge out of demo recordings.
  devIndicators: false,

  // Vercel handles image optimization outside the route function bundles.
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**"],
  },

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
    // Auth and realtime connect directly to Supabase; local origins are dev-only.
    const connectSrc =
      process.env.NODE_ENV === "production"
        ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
        : "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321";

    // Plain avatar/menu images need their storage origins in addition to self.
    const imgSrc =
      process.env.NODE_ENV === "production"
        ? "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com"
        : "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com http://127.0.0.1:54321";

    // React development stack traces require eval; production does not.
    const scriptSrc =
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    // Allow embedded development previews; deny framing in production.
    const frameHeaders =
      process.env.NODE_ENV === "production"
        ? [{ key: "X-Frame-Options", value: "DENY" }]
        : [];
    const frameAncestors =
      process.env.NODE_ENV === "production" ? "frame-ancestors 'none'" : null;

    return [
      {
        source: "/(.*)",
        headers: [
          ...frameHeaders,
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
            // Hydration scripts have no nonces here. Inline scripts remain allowed;
            // this policy constrains origins but cannot prevent inline XSS.
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
              frameAncestors,
            ]
              .filter(Boolean)
              .join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
