/**
 * "Şu an" bakılınca randevunun hangi hâlde olduğu.
 *
 * Ayrı dosyada ve `now` parametreli olmasının iki sebebi var: biri test
 * edilebilirlik, diğeri React'ın saflık kuralı — `Date.now()` bir bileşenin
 * gövdesinde çağrılamaz, çünkü aynı render iki farklı sonuç verebilir. Zaman
 * okuması burada, sınırda yapılır.
 *
 * Kararın kendisi burada verilmez: iptal penceresini de tutma süresini de
 * veritabanı yeniden kontrol eder (`booking_cancel`, `booking_confirm`).
 * Buradaki hesap yalnız EKRANDA ne göstereceğimizi seçer.
 */

export type CancelState =
  /** İptal edilebilir; buton gösterilir */
  | "open"
  /** İptal penceresi kapandı; "kliniği arayın" denir */
  | "too_late"
  /** Zaten iptal edilmiş, gelinmiş ya da tamamlanmış */
  | "closed";

export function cancelState(
  booking: { status: string; startsAt: Date; cancelWindowMinutes: number },
  now: Date = new Date(),
): CancelState {
  if (booking.status !== "pending" && booking.status !== "confirmed") return "closed";

  const minutesLeft = (booking.startsAt.getTime() - now.getTime()) / 60_000;
  return minutesLeft > booking.cancelWindowMinutes ? "open" : "too_late";
}

/** Tutma süresi doldu mu — dolduysa saat çoktan serbest sayılır. */
export function isHoldExpired(holdExpiresAt: Date, now: Date = new Date()): boolean {
  return holdExpiresAt.getTime() <= now.getTime();
}
