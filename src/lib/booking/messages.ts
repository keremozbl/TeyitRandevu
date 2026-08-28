/**
 * Veritabanının kısa `reason` kodlarının Türkçesi ve public sayfanın
 * biçimlendiricileri. Saf ve senkron — `"use server"` işaretli modüller
 * yalnızca async fonksiyon dışa verebildiği için ayrı dosyada.
 *
 * Kural: hata mesajı yalnız sorunu değil ÇIKIŞI da söyler. "Bu saat dolu"
 * hastayı bırakır, "Bu saat az önce doldu — başka bir saat seçin" yürütür.
 */

import type { PlainDate } from "@/lib/domain";

export type BookingReason =
  | "not_found"
  | "service_unavailable"
  | "resource_unavailable"
  | "in_past"
  | "too_soon"
  | "too_far"
  | "closed"
  | "slot_taken"
  | "rate_limited"
  | "expired"
  | "name_invalid"
  | "phone_invalid"
  | "consent_required"
  | "already_confirmed"
  | "already_cancelled"
  | "not_cancellable"
  | "cancel_window";

export type ReasonDetail = {
  minLeadMinutes?: number;
  maxAdvanceDays?: number;
  cancelWindowMinutes?: number;
};

/** 120 → "2 saat", 90 → "1 saat 30 dakika", 45 → "45 dakika" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 dakika";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} dakika`;
  if (rest === 0) return `${hours} saat`;
  return `${hours} saat ${rest} dakika`;
}

const MESSAGES: Record<BookingReason, (detail: ReasonDetail) => string> = {
  not_found: () => "Randevu sayfası bulunamadı. Bağlantıyı kontrol edin.",
  service_unavailable: () =>
    "Bu hizmet internetten randevuya kapalı. Kliniği arayarak randevu alabilirsiniz.",
  resource_unavailable: () => "Seçtiğiniz kişi bu hizmet için randevuya kapalı. Başka birini seçin.",
  in_past: () => "Geçmiş bir saat seçilmiş. Sayfayı yenileyip yeni bir saat seçin.",
  too_soon: (d) =>
    d.minLeadMinutes
      ? `Randevular en az ${formatDuration(d.minLeadMinutes)} önceden alınabiliyor. Daha ileri bir saat seçin.`
      : "Bu saat için çok geç kalındı. Daha ileri bir saat seçin.",
  too_far: (d) =>
    d.maxAdvanceDays
      ? `En fazla ${d.maxAdvanceDays} gün sonrasına randevu verilebiliyor.`
      : "Bu tarih randevuya henüz açık değil.",
  closed: () => "Seçilen saat çalışma saatlerinin dışında. Listeden bir saat seçin.",
  slot_taken: () => "Bu saat az önce doldu. Aşağıdan başka bir saat seçin.",
  rate_limited: () =>
    "Bu numara ya da bağlantı için çok fazla randevu talebi oluşturuldu. Kliniği arayabilirsiniz.",
  expired: () =>
    "Slot tutma süresi doldu ve saat serbest bırakıldı. Baştan bir saat seçmeniz gerekiyor.",
  name_invalid: () => "Ad soyad en az iki karakter olmalı.",
  phone_invalid: () => "Telefon numarası okunamadı. Örnek: 0555 123 45 67",
  consent_required: () =>
    "Randevu oluşturabilmek için aydınlatma metnini okuduğunuzu ve sağlık verinizin işlenmesine açık rıza verdiğinizi işaretlemeniz gerekiyor.",
  already_confirmed: () => "Bu randevu zaten oluşturulmuş.",
  already_cancelled: () => "Bu randevu zaten iptal edilmiş.",
  not_cancellable: () => "Bu randevu artık internetten iptal edilemiyor. Kliniği arayın.",
  cancel_window: (d) =>
    d.cancelWindowMinutes
      ? `Randevuya ${formatDuration(d.cancelWindowMinutes)} kaldığı için internetten iptal edilemiyor. Kliniği arayın.`
      : "Randevu saatine az kaldığı için internetten iptal edilemiyor. Kliniği arayın.",
};

export function bookingErrorMessage(reason: string | undefined, detail: ReasonDetail = {}): string {
  if (reason && reason in MESSAGES) return MESSAGES[reason as BookingReason](detail);
  return "Beklenmeyen bir sorun oldu. Lütfen tekrar deneyin.";
}

// -----------------------------------------------------------------------------
// Biçimlendirme — tümü tr-TR ve kurumun zaman diliminde (CLAUDE.md kural 6)
// -----------------------------------------------------------------------------

export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * "Pzt · 1 Eyl" — gün şeridi için kısa etiket. `PlainDate` zaten kurumun
 * yerel takviminde olduğu için biçimlendirme UTC öğlen üzerinden yapılır:
 * araya bir zaman dilimi daha sokmak günü kaydırırdı.
 */
export function formatDayChip(date: PlainDate): { weekday: string; day: string } {
  const instant = new Date(`${date}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "short" }).format(instant),
    day: new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "short" }).format(
      instant,
    ),
  };
}

/** "1 Eylül 2026 Pazartesi, 14:30" — özet ve onay ekranı için */
export function formatLongDateTime(instant: Date, timeZone: string): string {
  const date = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(instant);
  return `${date}, ${formatTime(instant, timeZone)}`;
}

export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}
