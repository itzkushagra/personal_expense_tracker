import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Since Next.js 16.3 the build writes a Turbopack cache to .next/cache that
    // includes the build's environment values, so private server keys (Gemini,
    // Supabase service role) would be saved to disk and kept in the host's
    // build cache. Off: slightly slower builds, no copy of the keys anywhere.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
