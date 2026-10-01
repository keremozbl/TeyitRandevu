import { siteUrl } from "@/lib/marketing/site-url";

/**
 * Kurumun müşterisine vereceği randevu bağlantısı ve yanındaki hazır metinler.
 *
 * Adres tek yerden üretiliyor. Daha önce kurulum sihirbazı "teyitrandevu.com/r/"
 * yazısını elle taşıyordu; `NEXT_PUBLIC_SITE_URL` başka bir alan adına
 * ayarlandığında sihirbaz yanlış adresi söylüyordu ve kurum o adresi
 * Instagram'ına koyuyordu. Artık kurulumda gösterilen, ayarlarda yazan,
 * QR'a gömülen ve hatırlatma mesajına giren adres aynı fonksiyondan çıkıyor.
 */

/** Public randevu sayfasının tam adresi. */
export function bookingUrl(slug: string): string {
  return `${siteUrl()}/r/${slug}`;
}

/** Ekranda gösterilecek hâli: protokol insanı ilgilendirmiyor. */
export function bookingDisplayUrl(slug: string): string {
  return bookingUrl(slug).replace(/^https?:\/\//, "");
}

/** Yalnızca alan adı — kurulumda giriş kutusunun önündeki sabit ek. */
export function bookingUrlPrefix(): string {
  return `${siteUrl().replace(/^https?:\/\//, "")}/r/`;
}

export type ShareChannel = {
  key: string;
  label: string;
  /** Kopyalanacak metin ya da yapılacak işin tarifi. */
  body: string;
  hint: string;
};

/**
 * Kuruma verilen hazır metinler.
 *
 * Hepsi **hizmet bilgilendirmesi** dilinde: "randevunuzu buradan
 * alabilirsiniz". Kampanya, indirim ya da davet cümlesi bilerek yok —
 * kurum bu metni kendi WhatsApp'ından toplu gönderirse ticari ileti olur ve
 * İYS onayı gerekir. Bizim kuyruğumuzdan çıkan mesajlar `message_kind` ile
 * zaten ayrılıyor (bkz. CLAUDE.md kural 7); burası kurumun kendi kanalı,
 * o yüzden metni baştan güvenli tarafta tutuyoruz.
 */
export function shareChannels(tenantName: string, url: string): ShareChannel[] {
  return [
    {
      key: "whatsapp",
      label: "WhatsApp / SMS",
      body: `${tenantName} randevu sayfası: ${url}\nUygun saatleri görüp randevunuzu buradan alabilirsiniz.`,
      hint: "Arayıp da yer bulamayan hastaya gönderilecek kısa metin.",
    },
    {
      key: "instagram",
      label: "Instagram profili",
      body: url,
      hint: "Profili düzenle → Web sitesi alanına yapıştırın. Hikâyede bağlantı rozetiyle de kullanılır.",
    },
    {
      key: "google",
      label: "Google İşletme Profili",
      body: url,
      hint: "İşletme profilinde “Randevu al” bağlantısı olarak ekleyin; aramada kartın altında çıkar.",
    },
  ];
}
