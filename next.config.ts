import type { NextConfig } from "next";

/**
 * Kurum logoları Supabase Storage'ın public kovasından geliyor; next/image
 * uzak kaynağı ancak burada tanımlıysa optimize ediyor. Host env'den
 * okunuyor: proje değişince config elle güncellenmesin.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
