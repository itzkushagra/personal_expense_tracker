import type { NextConfig } from "next";

// The browser only ever talks to this site and Supabase (sign-in and session
// refresh). Gemini is called from the server, and fonts are self-hosted by
// next/font, so nothing else needs to be allowed.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "https://*.supabase.co";
const supabaseWs = supabase.replace(/^https:/, "wss:");
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js adds small inline scripts to hydrate the page; dev mode also needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}`,
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nobody can show the app inside a frame on another site (clickjacking).
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Voice input needs the microphone on this site; nothing needs camera, location or payment APIs.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  experimental: {
    // Since Next.js 16.3 the build writes a Turbopack cache to .next/cache that
    // includes the build's environment values, so private server keys (Gemini,
    // Supabase service role) would be saved to disk and kept in the host's
    // build cache. Off: slightly slower builds, no copy of the keys anywhere.
    turbopackFileSystemCacheForBuild: false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are per-user data: never cache them in a shared cache.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
