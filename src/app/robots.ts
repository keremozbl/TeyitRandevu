import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/marketing/site-url";

/**
 * Panel, platform yönetimi ve API arama motoruna kapalı.
 *
 * Hepsi zaten oturum istiyor — bu dosya bir güvenlik önlemi değil, gereksiz
 * tarama ve "giriş yapın" sayfalarının dizine düşmesini engelliyor.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/yonetim", "/api", "/kurulum", "/auth"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
