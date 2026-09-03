import { notFound } from "next/navigation";

import { buildIcs } from "@/lib/booking/ics";
import { lookupBooking } from "@/lib/booking/queries";
import { siteUrl } from "@/lib/marketing/site-url";

/**
 * Randevunun takvim dosyası: `/r/<slug>/randevu/<token>/takvim`
 *
 * Yetki token'ın kendisi — sayfanın da kapısı o. Token bilinmeden dosya
 * indirilemiyor ve dosyada hastanın telefonu, notu ya da tıbbi bilgisi yok:
 * yalnızca saat, işlem adı ve adres.
 *
 * İptal edilmiş randevu için dosya üretilmiyor; takvime "iptal edildi" diye
 * bir kayıt eklemenin anlamı yok.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const { slug, token } = await params;
  const booking = await lookupBooking(token);

  if (!booking || booking.tenantSlug !== slug) notFound();
  if (booking.status === "cancelled" || booking.holdExpiresAt !== null) notFound();

  const title = [booking.tenantName, booking.serviceName].filter(Boolean).join(" · ");
  const link = `${siteUrl()}/r/${slug}/randevu/${token}`;

  const ics = buildIcs({
    uid: token,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    stamp: new Date(),
    title,
    location: [booking.branchName, booking.branchAddress].filter(Boolean).join(", "),
    description: [`${booking.resourceLabel} ile randevunuz.`, `Randevunuzu görüntüleyin: ${link}`]
      .filter(Boolean)
      .join("\n"),
    url: link,
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="randevu.ics"',
      // Randevu değişebilir (klinik saati kaydırabilir): önbelleğe alınmasın.
      "cache-control": "no-store",
    },
  });
}
