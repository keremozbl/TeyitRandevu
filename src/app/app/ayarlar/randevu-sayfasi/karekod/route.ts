import { requireTenant } from "@/lib/auth/session";
import { qrPng } from "@/lib/booking/qr-png";
import { bookingUrl } from "@/lib/booking/share";
import { slugify } from "@/lib/utils/slug";

/**
 * Randevu sayfasının karekodu, basılabilir PNG olarak.
 *
 * Adres istekten değil oturumdan geliyor: `requireTenant()` hangi kurumda
 * olduğumuzu söylüyor, karekod o kurumun adresini taşıyor. Sorgu
 * parametresiyle adres alsaydık uç, kimin adresi verilirse onun karekodunu
 * basan genel bir karekod üreticisine dönerdi.
 *
 * 1024 piksel hedefleniyor: 5 cm'lik bir etiket 300 dpi'da ~590 piksel
 * istiyor, A5 afiş daha fazlasını. Dosya yine birkaç kilobayt kalıyor.
 *
 * Denetim kaydı tutulmuyor — rapor dışa aktarımının aksine burada kişisel
 * veri yok, çıkan şey kurumun kendi herkese açık adresi.
 */
export async function GET() {
  const { active } = await requireTenant();
  const png = qrPng(bookingUrl(active.tenant.slug), { target: 1024 });

  // Dosya adı kurumun adından: indirenler klasörlerinde "qr.png" yığını
  // değil, hangi kuruma ait olduğu belli bir dosya görsün.
  const name = `${slugify(active.tenant.name) || active.tenant.slug}-randevu-karekod.png`;

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(png.length),
      // Adres değişmediği sürece karekod da değişmez, ama kurum adresini
      // değiştirdiğinde eski dosyanın dönmemesi gerekiyor.
      "cache-control": "private, no-cache",
    },
  });
}
