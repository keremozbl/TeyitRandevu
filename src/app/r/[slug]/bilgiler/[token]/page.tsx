import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { formatDuration, formatLongDateTime } from "@/lib/booking/messages";
import { lookupBooking } from "@/lib/booking/queries";
import { isHoldExpired } from "@/lib/booking/state";
import { buildConsentBoxes } from "@/lib/legal/consent-texts";

import { DetailsForm } from "./details-form";

/**
 * Bilgiler adımı — slot tutulmuşken doldurulur.
 *
 * Sayfa açıldığında randevu HENÜZ YOK: `pending` bir tutma kaydı var ve
 * `hold_expires_at` dolduğunda kendiliğinden düşecek. Bu yüzden üç ayrı hâl
 * var ve üçü de ayrı ekran: tutma yaşıyor (form), tutma öldü (baştan seç),
 * randevu zaten oluşmuş (onay ekranına git).
 */

// Token taşıyan sayfa arama motoruna girmez.
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

  if (!booking || booking.tenantSlug !== slug) notFound();

  // Randevu onaylanmışsa burada işimiz yok: form ikinci kez gönderilirse
  // aynı randevuya dönülür, yeni randevu açılmaz.
  if (booking.holdExpiresAt === null) redirect(`/r/${slug}/randevu/${token}`);

  const expired = isHoldExpired(booking.holdExpiresAt);

  if (expired) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error">
          Slot tutma süresi doldu ve saat serbest bırakıldı. Aşağıdan yeniden bir saat seçin.
        </Alert>
        <Link
          href={`/r/${slug}`}
          className="inline-flex h-11 w-full items-center justify-center rounded border border-accent bg-accent px-4 font-medium text-accent-ink no-underline"
        >
          Saat Seçimine Dön
        </Link>
      </div>
    );
  }

  const consents = buildConsentBoxes(booking.tenantName);
  const holdUntil = new Intl.DateTimeFormat("tr-TR", {
    timeZone: booking.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(booking.holdExpiresAt);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/r/${slug}`} className="text-[13px] text-ink-2 no-underline hover:text-ink">
          <span aria-hidden="true">‹</span> Saat seçimine dön
        </Link>
        <h1 className="text-lg tracking-tight">Bilgileriniz</h1>
      </div>

      <section
        aria-label="Seçtiğiniz randevu"
        className="flex flex-col gap-2 rounded border border-border bg-surface px-4 py-3.5"
      >
        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Tarih</dt>
            <dd className="min-w-0 font-medium text-ink" data-numeric>
              {formatLongDateTime(booking.startsAt, booking.timeZone)}
            </dd>
          </div>
          {booking.serviceName && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-3">İşlem</dt>
              <dd className="min-w-0 text-ink">
                {booking.serviceName}
                <span className="text-ink-3">
                  {" · "}
                  {formatDuration(
                    Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000),
                  )}
                </span>
              </dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Kim</dt>
            <dd className="min-w-0 truncate text-ink">{booking.resourceLabel}</dd>
          </div>
        </dl>

        <p className="border-t border-border pt-2 text-[13px] text-ink-2">
          Bu saat <span data-numeric>{holdUntil}</span>’e kadar sizin adınıza tutuluyor.
        </p>
      </section>

      <DetailsForm
        slug={slug}
        token={token}
        consents={consents}
        disclosureHref={`/r/${slug}/kvkk`}
      />
    </div>
  );
}
