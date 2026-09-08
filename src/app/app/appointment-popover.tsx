"use client";

import Link from "next/link";

import { cancelAppointmentAction, setAppointmentStatusAction } from "@/lib/appointments/edit-actions";
import { STATUS_STYLES, type AppointmentStatus } from "@/lib/scheduling/status";

/**
 * Randevuya tıklayınca açılan hızlı işlem kutusu.
 *
 * Neden var: resepsiyonun gün boyu yaptığı üç şey "onayla", "geldi" ve
 * "tamamlandı". Bunların her biri randevu sayfasına gidip formu kaydedip
 * takvime dönmeyi gerektiriyordu — üç sayfa yüklemesi, bir tık işlik iş için.
 *
 * Dört karar:
 *
 * 1. **Native `popover`.** Izgara kendi içinde `overflow: auto` ile kayıyor;
 *    içine mutlak konumlanmış bir kutu kırpılırdı. `popover="auto"` kutuyu üst
 *    katmana alıyor ve dışarı tıklama ile Esc'i bedavaya veriyor.
 * 2. **Eylemler düz `<form>`.** `setAppointmentStatusAction` zaten redirect
 *    eden bir server action; JavaScript kapalıyken kutu hiç açılmıyor ama
 *    randevu sayfasındaki aynı eylemler çalışmaya devam ediyor.
 * 3. **Sonraki adım gösteriliyor, beş durumun tamamı değil.** "Onay
 *    bekliyor"daki bir randevuda "tamamlandı" düğmesi, yanlışlıkla basılacak
 *    bir düğmedir.
 * 4. **İptal burada da yıkıcı.** Onay kutusu yok çünkü eylemin kendisi geri
 *    alınabilir: `cancelAppointmentAction` takvime `geri` parametresiyle
 *    dönüyor ve orada geri alma şeridi açılıyor.
 */

/**
 * Bu durumdayken hangi geçişler mantıklı — en olası önce, geri dönüş sonda.
 *
 * Beş durumun tamamı listelenmiyor: "onay bekliyor"daki bir randevuda
 * "tamamlandı" düğmesi, yanlışlıkla basılacak bir düğmedir. Ama her durumda
 * bir adım GERİ dönüş var, çünkü buradaki düğmeler küçük ve yan yana; yanlış
 * basmanın bedeli randevu sayfasına gitmek olmamalı.
 */
const NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "arrived", "no_show"],
  confirmed: ["arrived", "no_show", "pending"],
  arrived: ["completed", "confirmed"],
  completed: ["arrived"],
  no_show: [],
  cancelled: [],
};

/** Düğme üstündeki emir kipi; rozet etiketi ("Geldi") ile aynı şey değil. */
const VERB: Record<AppointmentStatus, string> = {
  pending: "Onay Bekliyor",
  confirmed: "Onayla",
  arrived: "Geldi",
  completed: "Tamamlandı",
  no_show: "Gelmedi",
  cancelled: "İptal Et",
};

export function AppointmentPopover({
  ref,
  popoverId,
  id,
  href,
  date,
  branchId,
  status,
  customerName,
  serviceName,
  range,
  isHold,
}: {
  ref: React.Ref<HTMLDivElement>;
  popoverId: string;
  id: string;
  href: string;
  date: string;
  branchId: string | null;
  status: AppointmentStatus;
  customerName: string;
  serviceName: string | null;
  range: string;
  isHold: boolean;
}) {
  const style = STATUS_STYLES[status];
  // Tamamlanmış randevu iptal edilmez: yapılmış bir iş geri alınmaz, düzeltmesi
  // randevu sayfasından yapılır.
  const cancellable = !isHold && status !== "completed";

  return (
    <div
      ref={ref}
      id={popoverId}
      // `manual`, `auto` değil. `auto`'nun kendi "dışarı tıklayınca kapan"
      // mantığı tıklamanın İÇİNDE açılan bir kutuyu anında kapatıyor:
      // `pointerdown` geldiğinde kutu henüz açık olmadığı için tarayıcı
      // tıklamayı "dışarıda" sayıyor. Esc ve dışarı tıklamayı bu yüzden
      // appointment-block.tsx kendisi bağlıyor — davranış aynı, zamanlama
      // varsayımı yok. Üst katman (`popover`) yine gerekli: ızgara kendi
      // içinde kayıyor ve normal bir kutu kırpılırdı.
      popover="manual"
      // `[popover]` varsayılanı `inset: 0; margin: auto` ile ortalar; konumu
      // açılışta biz veriyoruz (bkz. appointment-block.tsx).
      className="fixed inset-auto m-0 w-64 rounded-lg border border-border bg-surface p-0 text-ink shadow-[0_18px_44px_-24px_rgba(0,0,0,0.5)]"
    >
      <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span data-numeric className="font-mono text-[11px] text-ink-2">
            {range}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-2">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>
        <p className="truncate text-[14px] font-medium text-ink">{customerName}</p>
        {serviceName && <p className="truncate text-[12px] text-ink-2">{serviceName}</p>}
      </div>

      {!isHold && NEXT[status].length > 0 && (
        <div className="flex flex-col gap-1 border-b border-border p-1.5">
          {NEXT[status].map((next) => (
            <form key={next} action={setAppointmentStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={next} />
              <input type="hidden" name="tarih" value={date} />
              {branchId && <input type="hidden" name="sube" value={branchId} />}
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-surface-2"
              >
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${STATUS_STYLES[next].dot}`}
                />
                <span className="min-w-0 truncate">{VERB[next]}</span>
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 p-1.5">
        <Link
          href={href}
          className="rounded px-2 py-1.5 text-[13px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
        >
          Randevuyu aç →
        </Link>

        {cancellable && (
          <form action={cancelAppointmentAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="previous" value={status} />
            <input type="hidden" name="reason" value="" />
            <input type="hidden" name="tarih" value={date} />
            {branchId && <input type="hidden" name="sube" value={branchId} />}
            <button
              type="submit"
              className="w-full rounded px-2 py-1.5 text-left text-[13px] text-st-noshow transition-colors duration-150 hover:bg-st-noshow-soft"
            >
              İptal Et
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
