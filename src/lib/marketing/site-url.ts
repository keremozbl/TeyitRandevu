/**
 * Sitenin kökü.
 *
 * `NEXT_PUBLIC_SITE_URL` zaten hatırlatma mesajındaki randevu bağlantısı için
 * gerekiyordu (CANLIYA-GECIS B10); sitemap, robots ve paylaşım kartı da aynı
 * değeri kullanıyor ki iki farklı adres üretilmesin.
 *
 * Tanımsızsa localhost'a düşer: geliştirmede sayfa çalışsın, ama üretimde
 * yanlış bir alan adı uydurulmasın.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
