import { utcToPlainDate, type Slot } from "@/lib/domain";

/**
 * Randevu eylemlerinin ortak yardımcıları.
 *
 * Ayrı dosyada çünkü `"use server"` işaretli modüller yalnızca async fonksiyon
 * dışa verebilir; bu ikisi saf ve senkron.
 */

/** Takvime dönüş adresi; boş parametreler URL'e yazılmaz. */
export function calendarHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/app?${search.toString()}`;
}

/** Hata mesajı sorunu değil çözümü söyler: dolu saat yerine boş saati. */
export function conflictMessage(
  slot: Slot | null,
  timeZone: string,
  requestedDate: string,
): string {
  if (!slot) {
    return "Bu saat dolu. Bu kaynakta önümüzdeki bir hafta içinde uygun saat yok — başka bir kaynak ya da tarih seçin.";
  }

  const sameDay = utcToPlainDate(slot.startsAt, timeZone) === requestedDate;
  const formatted = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { weekday: "long", day: "numeric", month: "long" }),
  }).format(slot.startsAt);

  return `Bu saat dolu — en yakın uygun saat ${formatted}.`;
}
