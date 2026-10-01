import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/marketing/site-url";

/**
 * Yalnızca pazarlama sayfaları.
 *
 * `/app` ve `/yonetim` oturum ister, `/r/<slug>` ise kurumların sayfası:
 * onları buraya kurum listesini okuyarak eklemek, kiracıların adres
 * listesini tek dosyada yayımlamak olurdu. Kurum sayfaları kendi
 * `robots`/`metadata` kararlarını sonra alacak.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  return [
    // Site tek sayfa: fiyat, canlı demo ve iletişim ana sayfanın bölümleri.
    // Ayrı girdi vermek yok olan adresleri bildirmek olurdu (ikisi de artık
    // yalnızca yönlendirme — bkz. next.config.ts).
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/kvkk`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
