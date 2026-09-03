import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cancelBookingAction } from "@/lib/booking/actions";
import { bookingErrorMessage, formatDuration, formatLongDateTime } from "@/lib/booking/messages";
import { lookupBooking } from "@/lib/booking/queries";
import { cancelState } from "@/lib/booking/state";
import { formatPhoneTr } from "@/lib/utils/phone";

/**
 * Randevunun public görünümü — hastanın bağlantısı buraya çıkar.
 *
 * Aynı sayfa hem onay ekranı hem de sonradan bakılan randevu kartı. İkisini
 * ayırmak, hastaya iki farklı adres vermek demekti; bağlantı SMS'te duruyor ve
 * tek bir adres olmak zorunda.
 *
 * İptal iki adımlı ve JavaScript istemiyor: `?iptal=1` onay ekranını açar.
 * Geri alınamayan bir işlem tek tıkla yapılmaz.
 */

export const metadata: Metadata = {
  title: { absolute: "Randevunuz" },
  robots: { index: false, follow: false },
};

/** Dokunma hedefi 44px: bu sayfa telefonda açılıyor. */
const ACTION =
  "inline-flex h-11 flex-1 items-center justify-center rounded border border-border bg-surface " +
  "px-4 text-[14px] font-medium text-ink no-underline transition-colors duration-150 " +
  "hover:border-accent hover:bg-accent-soft sm:flex-none";

const PUBLIC_STATUS: Record<string, { title: string; body: string; tone: "info" | "success" }> = {
  pending: {
    title: "Randevu talebiniz alındı",
    body: "Klinik randevunuzu onayladığında bilgilendirileceksiniz.",
    tone: "success",
  },
  confirmed: {
    title: "Randevunuz onaylandı",
    body: "Randevu saatinden önce burada görebilir, gerekirse iptal edebilirsiniz.",
    tone: "success",
  },
  arrived: { title: "Kliniktesiniz", body: "İyi günler dileriz.", tone: "info" },
  completed: { title: "Randevunuz tamamlandı", body: "Geçmiş olsun.", tone: "info" },
  no_show: {
    title: "Randevunuza gelinmedi",
    body: "Yeni bir randevu almak için randevu sayfasını kullanabilirsiniz.",
    tone: "info",
  },
  cancelled: {
    title: "Randevunuz iptal edildi",
    body: "Yeni bir randevu almak isterseniz randevu sayfasından seçim yapabilirsiniz.",
    tone: "info",
  },
};

export default async function RandevuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ iptal?: string; hata?: string }>;
}) {
  const { slug, token } = await params;
  const { iptal, hata } = await searchParams;
  const booking = await lookupBooking(token);

  if (!booking || booking.tenantSlug !== slug) notFound();

  // Slot hâlâ tutuluyorsa randevu daha oluşmadı: form adımına dön.
  if (booking.holdExpiresAt !== null) redirect(`/r/${slug}/bilgiler/${token}`);

  const state = PUBLIC_STATUS[booking.status] ?? PUBLIC_STATUS.pending;
  const canCancel = cancelState(booking);
  const cancellable = canCancel === "open";
  const tooLateToCancel = canCancel === "too_late";

  const error = hata
    ? bookingErrorMessage(hata, { cancelWindowMinutes: booking.cancelWindowMinutes })
    : null;

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col gap-1">
        <h1 className="text-lg tracking-tight">{state.title}</h1>
        <p className="text-[13px] text-ink-2">{state.body}</p>
      </div>

      <section
        aria-label="Randevu bilgileri"
        className={[
          "flex flex-col gap-3 rounded border-l-2 border border-border bg-surface px-4 py-3.5",
          booking.status === "cancelled" ? "border-l-st-cancelled" : "border-l-accent",
        ].join(" ")}
      >
        {/* Tarih listenin bir satırı değil, kartın kendisi: hasta bu ekranı
            saatini görmek için açıyor. */}
        <p data-numeric className="text-[20px] font-semibold leading-tight text-ink">
          {formatLongDateTime(booking.startsAt, booking.timeZone)}
        </p>

        <dl className="flex flex-col gap-1.5 text-[13px]">
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
          {booking.customerName && (
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-ink-3">Ad</dt>
              <dd className="min-w-0 truncate text-ink">{booking.customerName}</dd>
            </div>
          )}
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-ink-3">Yer</dt>
            <dd className="min-w-0 text-ink">
              {booking.branchName}
              {booking.branchAddress && (
                <span className="block text-ink-2">{booking.branchAddress}</span>
              )}
            </dd>
          </div>
        </dl>

        {booking.branchPhone && (
          <a
            href={`tel:${booking.branchPhone}`}
            className="self-start text-[13px] text-ink-2 underline underline-offset-2"
            data-numeric
          >
            {formatPhoneTr(booking.branchPhone)}
          </a>
        )}
      </section>

      {/* Eylemler: takvime ekle, yol tarifi, ara. Üçü de hastanın randevudan
          önce yapmak isteyeceği şeyler; iptal aşağıda ve daha sessiz. */}
      {booking.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          <a href={`/r/${slug}/randevu/${token}/takvim`} className={ACTION} download>
            Takvime ekle
          </a>
          {booking.branchAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [booking.branchName, booking.branchAddress].filter(Boolean).join(", "),
              )}`}
              target="_blank"
              rel="noreferrer noopener"
              className={ACTION}
            >
              Yol tarifi
            </a>
          )}
          {booking.branchPhone && (
            <a href={`tel:${booking.branchPhone}`} className={ACTION}>
              Kliniği ara
            </a>
          )}
        </div>
      )}

      {tooLateToCancel && (
        <Alert tone="info">
          Randevunuza {formatDuration(booking.cancelWindowMinutes)} ya da daha az kaldığı için
          internetten iptal edilemiyor. İptal için kliniği arayın.
        </Alert>
      )}

      {cancellable && !iptal && (
        <Link
          href={`/r/${slug}/randevu/${token}?iptal=1`}
          className="self-start text-[13px] text-ink-2 underline underline-offset-2"
        >
          Randevumu iptal etmek istiyorum
        </Link>
      )}

      {cancellable && iptal && (
        <form
          action={cancelBookingAction}
          className="flex flex-col gap-3 rounded border border-st-noshow bg-st-noshow-soft px-4 py-3.5"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="token" value={token} />
          <p className="text-[13px] font-medium text-ink">
            Randevunuzu iptal etmek istediğinize emin misiniz?
          </p>
          <Field id="sebep" label="İptal sebebi" hint="İsteğe bağlı; kliniğe iletilir.">
            <Input id="sebep" name="sebep" maxLength={300} autoComplete="off" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="danger" size="lg">
              Evet, İptal Et
            </Button>
            <Link
              href={`/r/${slug}/randevu/${token}`}
              className="text-[13px] text-ink-2 underline underline-offset-2"
            >
              Vazgeç
            </Link>
          </div>
        </form>
      )}

      <Link
        href={`/r/${slug}`}
        className="self-start text-[13px] text-ink-2 no-underline hover:text-ink"
      >
        Yeni randevu al <span aria-hidden="true">›</span>
      </Link>
    </div>
  );
}
