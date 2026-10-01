/**
 * Sitenin kökü.
 *
 * Buradan çıkan adres yalnızca sitemap'i etkilemiyor: kurumun müşterisine
 * verdiği randevu bağlantısı, basılan karekodun içine gömülen URL ve
 * hatırlatma mesajındaki link de bu fonksiyondan üretiliyor
 * (`src/lib/booking/share.ts`). Yanlış değer sessizce yanlış sonuç verir —
 * sayfa açılır, hiçbir hata çıkmaz, sadece link kimsenin ulaşamayacağı bir
 * yere gider.
 *
 * Üç kaynak, bu sırayla:
 *
 * 1. **`NEXT_PUBLIC_SITE_URL`** — elle verilen değer. Özel alan adı
 *    bağlandığında ya da başka bir yerde barındırıldığında burası kullanılır.
 * 2. **`NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL`** — Vercel'in kendi
 *    verdiği üretim adresi. Her dağıtımda otomatik dolar, önizleme
 *    dağıtımlarında bile üretim adresini gösterir ve özel alan adı
 *    eklendiğinde kendiliğinden ona döner. Yani Vercel'de hiçbir şey
 *    ayarlamadan da doğru adres çıkıyor.
 * 3. **`localhost:3000`** — geliştirme.
 *
 * `VERCEL_URL` bilerek kullanılmıyor: o her dağıtıma özel bir adres üretiyor
 * (`proje-a1b2c3.vercel.app`). Bir hastaya gönderilen hatırlatma linki bir
 * sonraki dağıtımda ölürdü.
 */

/** Vercel değişkenleri protokolsüz gelir; https eklenir ve sondaki eğik çizgi atılır. */
function normalize(value: string, withProtocol = false): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return withProtocol && !/^https?:\/\//.test(trimmed) ? `https://${trimmed}` : trimmed;
}

export function siteUrl(): string {
  const explicit = normalize(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const vercel = normalize(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ?? "", true);

  // Yerel `.env`i Vercel'e olduğu gibi kopyalamak çok kolay ve sonucu sinsi:
  // üretimdeki her randevu bağlantısı `localhost` gösterir. Vercel'de
  // çalışırken localhost'u gösteren elle verilmiş bir değer yok sayılır —
  // orada localhost'un hiçbir anlamı yok.
  const onVercel = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL);
  const explicitIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/.test(explicit);

  if (explicit && !(onVercel && explicitIsLocal)) return explicit;
  if (vercel) return vercel;

  return "http://localhost:3000";
}
