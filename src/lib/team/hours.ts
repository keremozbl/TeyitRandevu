/**
 * Haftalık çalışma saatlerinin saf mantığı.
 *
 * Veritabanı günde birden çok aralık tutar (`working_hours` satırları): öğle
 * arası ayrı bir kavram değil, iki aralık arasındaki boşluktur. Form da aynı
 * şekilde çalışıyor — "mola" diye bir alan yok, gün iki aralığa bölünüyor.
 * Böylece kaydederken çeviri yapılmıyor, dolayısıyla veri kaybı da olmuyor.
 *
 * Saatler yerel duvar saati: `time` sütunu, tarih ve saat dilimi yok. Slot
 * motoru bunları kurumun zaman diliminde güne oturtuyor.
 */

/** "HH:MM" — veritabanı "09:00:00" döndürür, form "09:00" gönderir. */
export type TimeRange = { startsAt: string; endsAt: string };

export type DayHours = { weekday: number; ranges: TimeRange[] };

export type WorkingHourRow = { weekday: number; starts_at: string; ends_at: string };

/** 0 = pazar (Postgres `extract(dow)` ile aynı); gösterim pazartesiden başlar. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
  0: "Pazar",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Pzt",
  2: "Sal",
  3: "Çar",
  4: "Per",
  5: "Cum",
  6: "Cts",
  0: "Paz",
};

/** Formun gün başına gösterdiği aralık sayısı; fazlası uyarıyla belirtilir. */
export const RANGES_PER_DAY = 2;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:00:00" ya da "9:00" → "09:00"; okunamayan değer boş döner. */
export function normalizeTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return "";
  const hour = Number(match[1]);
  if (hour > 23) return "";
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

const minutesOf = (time: string): number => {
  const match = TIME_RE.exec(time);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

/** Veritabanı satırları → haftanın yedi günü, gösterim sırasında. */
export function rowsToWeek(rows: WorkingHourRow[]): DayHours[] {
  return WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    ranges: rows
      .filter((row) => row.weekday === weekday)
      .map((row) => ({
        startsAt: normalizeTime(row.starts_at),
        endsAt: normalizeTime(row.ends_at),
      }))
      .filter((range) => range.startsAt !== "" && range.endsAt !== "")
      .sort((left, right) => minutesOf(left.startsAt) - minutesOf(right.startsAt)),
  }));
}

/** Haftanın hâli → yazılacak satırlar. Boş günler satır üretmez. */
export function weekToRows(week: DayHours[]): WorkingHourRow[] {
  const rows: WorkingHourRow[] = [];
  for (const day of week) {
    for (const range of day.ranges) {
      if (!range.startsAt || !range.endsAt) continue;
      rows.push({ weekday: day.weekday, starts_at: range.startsAt, ends_at: range.endsAt });
    }
  }
  return rows;
}

/**
 * Kaydetmeden önceki denetim. Hata varsa insanın anlayacağı tek cümle döner —
 * hangi gün olduğu yazılır, yoksa kullanıcı yedi satırı tek tek arar.
 */
export function validateWeek(week: DayHours[]): string | null {
  for (const day of week) {
    const label = WEEKDAY_LABELS[day.weekday] ?? "Gün";
    let previousEnd = -1;

    for (const range of day.ranges) {
      const hasStart = range.startsAt !== "";
      const hasEnd = range.endsAt !== "";

      if (hasStart !== hasEnd) {
        return `${label}: bir aralığın hem başlangıcı hem bitişi yazılmalı.`;
      }
      if (!hasStart) continue;

      const start = minutesOf(range.startsAt);
      const end = minutesOf(range.endsAt);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return `${label}: saat biçimi okunamadı, örnek 09:00.`;
      }
      if (end <= start) {
        return `${label}: bitiş saati başlangıçtan sonra olmalı.`;
      }
      if (start < previousEnd) {
        return `${label}: aralıklar çakışıyor, ikincisi birincinin bitişinden sonra başlamalı.`;
      }
      previousEnd = end;
    }
  }
  return null;
}

/** Listede tek satırda görünen özet: "Pzt–Cum 09:00–12:30, 13:30–18:00". */
export function summarizeWeek(week: DayHours[]): string {
  const signature = (day: DayHours) =>
    day.ranges
      .filter((range) => range.startsAt && range.endsAt)
      .map((range) => `${range.startsAt}–${range.endsAt}`)
      .join(", ");

  const ordered = WEEKDAY_ORDER.map(
    (weekday) => week.find((day) => day.weekday === weekday) ?? { weekday, ranges: [] },
  );

  const groups: { days: number[]; hours: string }[] = [];
  for (const day of ordered) {
    const hours = signature(day);
    const last = groups.at(-1);
    if (last && last.hours === hours) last.days.push(day.weekday);
    else groups.push({ days: [day.weekday], hours });
  }

  const parts = groups
    .filter((group) => group.hours !== "")
    .map((group) => {
      const first = WEEKDAY_SHORT[group.days[0]];
      const last = WEEKDAY_SHORT[group.days[group.days.length - 1]];
      const span =
        group.days.length === 1
          ? first
          : group.days.length === 2
            ? `${first}, ${last}`
            : `${first}–${last}`;
      return `${span} ${group.hours}`;
    });

  return parts.length > 0 ? parts.join(" · ") : "Çalışma saati girilmemiş";
}

/** Günde formun gösterebileceğinden fazla aralık var mı? Kaydetmek onları düşürür. */
export function hasExtraRanges(week: DayHours[]): boolean {
  return week.some((day) => day.ranges.length > RANGES_PER_DAY);
}
