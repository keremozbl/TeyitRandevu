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
  /**
   * Server action gövde sınırı — varsayılan 1 MB.
   *
   * Logo zaten 512 KB ile sınırlı ve asıl kontrol tarayıcıda (branding-form),
   * ama JavaScript kapalıyken form doğrudan action'a POST ediliyor. O yolda
   * 1 MB'lık varsayılan, "Logo 512 KB'tan küçük olmalı" mesajı yerine
   * çerçevenin "Body exceeded 1 MB limit" hatasını üretiyordu — kullanıcı için
   * çöken bir ekran. 2 MB, sunucudaki kendi kontrolümüzün konuşabilmesi için.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
