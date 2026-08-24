/**
 * Slot hesaplama motoru.
 *
 *   Uygunluk = çalışma saatleri − izinler − mevcut randevular − tamponlar
 *              − minimum ön süre − en fazla ileri tarih
 *
 * Slot tablosu TUTULMAZ (Kural 2): çalışma saati değişince tutulan slotlar
 * yalan söyler. Burası saf mantıktır — veritabanı, React ya da `Date.now()`
 * bağımlılığı yok; `now` dışarıdan verilir ki test edilebilsin.
 *
 * İki incelik:
 *
 * 1. **Tampon asimetriktir.** Randevunun kendisi açık çalışma zamanının içinde
 *    olmak zorundadır; tamponu kapanışın ya da öğle molasının üstüne taşabilir.
 *    17:30 başlayan yarım saatlik işlemin 15 dakikalık sterilizasyonu 18:15
 *    olur, bu randevuyu geçersiz kılmaz. Taşmanın yasak olduğu tek yer başka
 *    bir randevunun bloke aralığıdır.
 *
 * 2. **Motorun çakışma tanımı veritabanınınkiyle birebir aynıdır.** Veritabanı
 *    `appointments_no_overlap` ile yalnız randevu-randevu çakışmasını
 *    engelliyor; motor da yalnız onu kontrol eder. Daha gevşek olsaydı motor
 *    veritabanının reddedeceği slotu müşteriye gösterirdi.
 */

import {
  intervalsOverlap,
  mergeIntervals,
  subtractIntervals,
  type Interval,
} from "./intervals.ts";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "./booking-rules.ts";
import {
  addDays,
  datesBetween,
  utcToPlainDate,
  weekdayOf,
  zonedTimeToUtc,
  type PlainDate,
  type PlainTime,
} from "./time.ts";

/** `working_hours` satırı: haftalık şablon, kurumun zaman diliminde duvar saati. */
export type WorkingHour = {
  /** 0 = pazar */
  weekday: number;
  startsAt: PlainTime;
  endsAt: PlainTime;
};

export type ResourceSchedule = {
  workingHours: readonly WorkingHour[];
  /** `time_off` satırları: izin, mola, kongre, arıza (UTC) */
  timeOff?: readonly Interval[];
  /** Mevcut randevuların tamponlar dahil bloke aralıkları: `blocked_from` / `blocked_to` */
  busy?: readonly Interval[];
};

export type ServiceDuration = {
  durationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
};

export type AvailabilityInput = {
  /** Kurumun ya da şubenin IANA zaman dilimi */
  timeZone: string;
  /** Aralığın iki ucu da dahildir, kurumun yerel takvimine göre */
  from: PlainDate;
  to: PlainDate;
  schedule: ResourceSchedule;
  service: ServiceDuration;
  /**
   * Rezervasyon kuralları. Verilmezse ön süre ve ileri tarih sınırı
   * uygulanmaz — panelden randevu açan personel bu sınırlara tabi değildir.
   */
  rules?: BookingRules;
  /** Izgara adımı; verilmezse kuraldaki `slot_step_minutes` */
  stepMinutes?: number;
  now?: Date;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  /** Tamponlar dahil gerçekten meşgul olacak aralık — randevu satırıyla aynı */
  blockedFrom: Date;
  blockedTo: Date;
};

export type DayAvailability = {
  date: PlainDate;
  slots: Slot[];
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Bir kaynağın açık zamanı: çalışma saatleri eksi izinler. Randevular
 * çıkarılmaz — takvim ızgarası boş zamanı bu aralıklarla çizer, randevuları
 * üstüne koyar.
 */
export function computeOpenWindows(
  date: PlainDate,
  timeZone: string,
  schedule: ResourceSchedule,
): Interval[] {
  const weekday = weekdayOf(date);
  const windows = schedule.workingHours
    .filter((wh) => wh.weekday === weekday)
    .map((wh) => {
      const start = zonedTimeToUtc(date, wh.startsAt, timeZone);
      const end = zonedTimeToUtc(date, wh.endsAt, timeZone);
      // Postgres `time` sütunu 24:00:00 kabul eder; o gün sonu demektir.
      return end > start ? { start, end } : { start, end: new Date(end.getTime() + DAY_MS) };
    });

  return subtractIntervals(mergeIntervals(windows), schedule.timeOff ?? []);
}

function assertValidService({ durationMin, bufferBeforeMin, bufferAfterMin }: ServiceDuration) {
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    throw new Error(`Geçersiz hizmet süresi: ${durationMin}`);
  }
  for (const buffer of [bufferBeforeMin ?? 0, bufferAfterMin ?? 0]) {
    if (!Number.isFinite(buffer) || buffer < 0) throw new Error(`Geçersiz tampon: ${buffer}`);
  }
}

/**
 * Verilen gün aralığındaki uygun slotlar, günlere gruplanmış.
 * Kapalı gün de dizide yer alır (arayüz boş durumu çizebilsin).
 */
export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const { timeZone, schedule, service, rules } = input;
  assertValidService(service);

  const now = input.now ?? new Date();
  const step =
    input.stepMinutes ?? rules?.slot_step_minutes ?? DEFAULT_BOOKING_RULES.slot_step_minutes;
  if (!Number.isFinite(step) || step <= 0) throw new Error(`Geçersiz ızgara adımı: ${step}`);

  const durationMs = service.durationMin * MINUTE_MS;
  const bufferBeforeMs = (service.bufferBeforeMin ?? 0) * MINUTE_MS;
  const bufferAfterMs = (service.bufferAfterMin ?? 0) * MINUTE_MS;
  const stepMs = step * MINUTE_MS;

  // Ön süre bir andır; ileri tarih sınırı bir takvim günüdür, çünkü
  // "en fazla 60 gün ilerisi" o günün tamamı açık demektir.
  const earliestStart = rules ? now.getTime() + rules.min_lead_minutes * MINUTE_MS : -Infinity;
  const lastOpenDate = rules ? addDays(utcToPlainDate(now, timeZone), rules.max_advance_days) : null;

  const busy = mergeIntervals(schedule.busy ?? []);

  return datesBetween(input.from, input.to).map((date) => {
    if (lastOpenDate !== null && date > lastOpenDate) return { date, slots: [] };

    const slots: Slot[] = [];
    for (const window of computeOpenWindows(date, timeZone, schedule)) {
      const windowEnd = window.end.getTime();
      for (let start = window.start.getTime(); start + durationMs <= windowEnd; start += stepMs) {
        if (start < earliestStart) continue;

        const blocked: Interval = {
          start: new Date(start - bufferBeforeMs),
          end: new Date(start + durationMs + bufferAfterMs),
        };
        if (busy.some((taken) => intervalsOverlap(blocked, taken))) continue;

        slots.push({
          startsAt: new Date(start),
          endsAt: new Date(start + durationMs),
          blockedFrom: blocked.start,
          blockedTo: blocked.end,
        });
      }
    }
    return { date, slots };
  });
}

export type BookingRefusal = "in_past" | "too_soon" | "too_far";

/**
 * Rezervasyon penceresi kontrolü — yazma yolunda kullanıcıya anlamlı hata
 * verebilmek için. Gerçek çakışma güvencesi veritabanındaki kısıttır (Kural 1);
 * burası onun yerine geçmez, yalnız hata mesajını insanlaştırır.
 */
export function checkBookingWindow(
  startsAt: Date,
  rules: BookingRules,
  timeZone: string,
  now: Date = new Date(),
): BookingRefusal | null {
  const start = startsAt.getTime();
  if (start < now.getTime()) return "in_past";
  if (start < now.getTime() + rules.min_lead_minutes * MINUTE_MS) return "too_soon";
  if (
    utcToPlainDate(startsAt, timeZone) > addDays(utcToPlainDate(now, timeZone), rules.max_advance_days)
  ) {
    return "too_far";
  }
  return null;
}

/**
 * Aynı saati veren kaynakların tek satırda birleşmesi. Public sayfada müşteri
 * "hekim fark etmez" dediğinde seçim buradan yapılır.
 */
export type SharedSlot = Slot & { resourceIds: string[] };

export function mergeResourceAvailability(
  perResource: readonly { resourceId: string; days: readonly DayAvailability[] }[],
): { date: PlainDate; slots: SharedSlot[] }[] {
  const byDate = new Map<PlainDate, Map<number, SharedSlot>>();

  for (const { resourceId, days } of perResource) {
    for (const day of days) {
      let slotsOfDay = byDate.get(day.date);
      if (!slotsOfDay) {
        slotsOfDay = new Map();
        byDate.set(day.date, slotsOfDay);
      }
      for (const slot of day.slots) {
        const key = slot.startsAt.getTime();
        const existing = slotsOfDay.get(key);
        if (existing) {
          if (!existing.resourceIds.includes(resourceId)) existing.resourceIds.push(resourceId);
        } else {
          slotsOfDay.set(key, { ...slot, resourceIds: [resourceId] });
        }
      }
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slotsOfDay]) => ({
      date,
      slots: [...slotsOfDay.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    }));
}

/**
 * Hedefe en yakın slot. Çakışma hatasını "Bu saat dolu — en yakın uygun saat
 * 14:30" mesajına çevirmek için: hata yalnız sorunu değil çözümü de söyler.
 *
 * Eşit uzaklıkta iki slot varsa önceki seçilir; erken saat resepsiyon için
 * daha kullanışlı.
 */
export function nearestSlot(days: readonly DayAvailability[], target: Date): Slot | null {
  let best: Slot | null = null;
  let bestDistance = Infinity;

  for (const day of days) {
    for (const slot of day.slots) {
      const distance = Math.abs(slot.startsAt.getTime() - target.getTime());
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
  }

  return best;
}
