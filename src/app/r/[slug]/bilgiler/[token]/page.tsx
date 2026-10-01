import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { lookupBooking } from "@/lib/booking/queries";
import { bookingHref } from "@/lib/booking/steps";

/**
 * Eski bilgiler adımı — artık ayrı bir sayfa değil.
 *
 * Bilgiler bölümü randevu sayfasının içine taşındı; akışın tamamı tek
 * ekranda. Bu yol yalnızca yönlendirme olarak duruyor: tutma bağlantısı
 * paylaşılmış, yer imine eklenmiş ya da geri tuşuyla gelinmiş olabilir.
 * Kaldırılsaydı o kişiler 404 görürdü.
 *
 * Randevu zaten onaylanmışsa onay ekranına gidiyor — form ikinci kez
 * gönderilsin diye değil, hasta "randevum ne oldu" diye baktığında
 * cevabı görsün diye.
 */

export const metadata: Metadata = {
  title: { absolute: "Bilgileriniz" },
  robots: { index: false, follow: false },
};

export default async function BilgilerPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const booking = await lookupBooking(token);

  if (booking && booking.tenantSlug === slug && booking.holdExpiresAt === null) {
    redirect(`/r/${slug}/randevu/${token}`);
  }

  redirect(`${bookingHref(slug, { tutma: token })}#bilgiler`);
}
