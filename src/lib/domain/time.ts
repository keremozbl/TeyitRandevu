/**
 * Zaman dilimi yardımcıları — kütüphanesiz.
 *
 * Kural 6: veritabanında her şey UTC (`timestamptz`), gösterim ve çalışma
 * saatleri kurumun IANA zaman diliminde. Çalışma saatleri duvar saatidir
 * ("09:00"), bir anı değil; hangi UTC anına denk geldiği tarihe göre değişir
 * (yaz saati). Bu dosya o çeviriyi `Intl` üzerinden yapar, çünkü ICU zaten
 * Node ve tarayıcıda var; ayrı bir tarih kütüphanesi bağımlılığı gerekmiyor.
 */

/** "YYYY-MM-DD" — zaman dilimi taşımayan takvim günü. */
export type PlainDate = string;

/** "HH:MM" ya da "HH:MM:SS" — Postgres `time` sütunundan geldiği hâliyle. */
export type PlainTime = string;

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLAIN_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Bir UTC anının verilen zaman dilimindeki duvar saati parçaları. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Zaman dilimi biçimlendirmesi eksik: ${type}`);
    return Number(part.value);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // bazı ICU sürümleri gece yarısını 24 diye verir
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Verilen an için zaman diliminin UTC'ye göre kayması (ms). */
function offsetMsAt(instantMs: number, timeZone: string): number {
  const p = zonedParts(new Date(instantMs), timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instantMs / 1000) * 1000;
}

export function parsePlainTime(time: PlainTime): { hour: number; minute: number; second: number } {
  const m = PLAIN_TIME_RE.exec(time);
  if (!m) throw new Error(`Geçersiz saat: ${time}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] ?? "0");
  // Postgres `time` 24:00:00 kabul eder; gün sonunu bu şekilde ifade eden
  // çalışma saati satırları ertesi günün 00:00'ına taşınır.
  if (hour > 24 || minute > 59 || second > 59) throw new Error(`Geçersiz saat: ${time}`);
  return { hour, minute, second };
}

function parsePlainDate(date: PlainDate): { year: number; month: number; day: number } {
  const m = PLAIN_DATE_RE.exec(date);
  if (!m) throw new Error(`Geçersiz tarih: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Duvar saatini UTC anına çevirir.
 *
 * İki geçiş gerekir: ilk tahmin için kaymayı yanlış anda ölçeriz, ikinci geçiş
 * yaz saati sınırında düzeltir. Var olmayan bir yerel saat verilirse (ileri
 * alınan gecede kaybolan saat) sonuç boşluğun bittiği ana düşer; iki kez yaşanan
 * saat (geri alınan gece) kış saatindeki ikinci geçişe denk gelir.
 */
export function zonedTimeToUtc(date: PlainDate, time: PlainTime, timeZone: string): Date {
  const { year, month, day } = parsePlainDate(date);
  const { hour, minute, second } = parsePlainTime(time);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstGuess = asIfUtc - offsetMsAt(asIfUtc, timeZone);
  return new Date(asIfUtc - offsetMsAt(firstGuess, timeZone));
}

/** Bir UTC anının o zaman dilimindeki takvim günü. */
export function utcToPlainDate(instant: Date, timeZone: string): PlainDate {
  const p = zonedParts(instant, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Gün başlangıcından itibaren geçen dakika — ızgara yerleşimi için. */
export function minutesIntoDay(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return p.hour * 60 + p.minute + Math.floor(p.second / 60);
}

/**
 * Haftanın günü: 0 = pazar. Postgres `extract(dow)` ve `working_hours.weekday`
 * ile aynı numaralandırma.
 */
export function weekdayOf(date: PlainDate): number {
  const { year, month, day } = parsePlainDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const { year, month, day } = parsePlainDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return utcToPlainDate(shifted, "UTC");
}

/** İki takvim günü arası (ikisi de dahil), artan sırada. */
export function datesBetween(from: PlainDate, to: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
    if (dates.length > 400) throw new Error("Tarih aralığı fazla geniş");
  }
  return dates;
}
