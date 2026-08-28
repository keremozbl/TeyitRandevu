/**
 * Zaman dilimi yardımcıları.
 *
 * Ayrı dosyada çünkü `"use server"` işaretli modüller yalnızca async fonksiyon
 * dışa verebilir; bunlar saf ve senkron.
 *
 * Zaman dilimi kurumun en kritik ayarı: yanlış bir değer randevu saatlerini
 * sessizce kaydırır, hata vermez. O yüzden yazılmadan önce doğrulanır.
 */

/** Panelde sunulan diller; liste kapalı değil, kurum kendi değerini yazabilir. */
export const COMMON_TIME_ZONES = [
  "Europe/Istanbul",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Nicosia",
] as const;

/** "Europe/Istanbul" ya da "UTC" — bölge/şehir biçimi. */
const IANA_RE = /^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/;

/**
 * IANA adı tanınıyor mu?
 *
 * İki kapı var. `Intl` tanımayan adda hata atar, takvim de o anda çöker.
 * Ama `Intl` ham ofseti de ("+03:00") kabul ediyor ve bu bizim için geçerli
 * bir değer değil: sabit ofset yaz saati geçişini bilmez, Avrupa şubesi olan
 * bir kurumda randevular yılda iki kez bir saat kayardı. Bölge adı isteniyor.
 */
export function isValidTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !IANA_RE.test(trimmed)) return false;
  try {
    new Intl.DateTimeFormat("tr-TR", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Seçim listesi: yaygın diller + kurumun hâlihazırdaki değeri.
 *
 * Kayıtlı değer listede yoksa yine de görünmeli — aksi hâlde ayar ekranını
 * açıp kaydeden biri, farkında olmadan zaman dilimini değiştirir.
 */
export function timeZoneOptions(current: string): string[] {
  const options = [...COMMON_TIME_ZONES] as string[];
  const trimmed = current.trim();
  if (trimmed && !options.includes(trimmed)) options.unshift(trimmed);
  return options;
}

/** "Europe/Istanbul (UTC+03:00)" — hangi dilim olduğu tek bakışta görünsün. */
export function describeTimeZone(timeZone: string, now: Date = new Date()): string {
  if (!isValidTimeZone(timeZone)) return timeZone;
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;
  return offset ? `${timeZone} (${offset})` : timeZone;
}
