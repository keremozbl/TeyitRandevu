/**
 * Veritabanı satırları → slot motorunun girdi tipleri.
 *
 * Motor (`src/lib/domain`) bilerek veritabanından habersiz: `Date` ve sayı
 * bilir, `timestamptz` string'i ya da `appointment_status` bilmez. Sınırdaki
 * çeviri burada, tek yerde yapılır ve testi vardır — çünkü sessizce yanlış
 * çevrilen bir alan (iptal edilmiş randevunun yer kaplaması, `starts_at` yerine
 * `blocked_from` kullanılmaması) motoru değil takvimi bozar.
 *
 * Buradaki her şey saftır; Supabase çağrısı `queries.ts` içinde.
 */

import type {
  Interval,
  ResourceSchedule,
  ServiceDuration,
  WorkingHour,
} from "@/lib/domain";
import type { Enums, Tables } from "@/lib/supabase/types";

export type WorkingHourRow = Pick<
  Tables<"working_hours">,
  "resource_id" | "weekday" | "starts_at" | "ends_at"
>;

export type TimeOffRow = Pick<Tables<"time_off">, "resource_id" | "starts_at" | "ends_at">;

export type BlockingAppointmentRow = Pick<
  Tables<"appointments">,
  "resource_id" | "blocked_from" | "blocked_to"
> & {
  /**
   * Yoksa satır DOLU kabul edilir. Public randevu sayfası aralıkları
   * `booking_availability` fonksiyonundan alıyor ve orada iptal/gelmedi zaten
   * süzülmüş; dışarı durum bilgisi hiç çıkmıyor. Eksik durumun yer kaplaması
   * güvenli yön: hata hâlinde slot fazladan kapanır, fazladan açılmaz.
   */
  status?: Enums<"appointment_status">;
};

export type ServiceRow = Pick<
  Tables<"services">,
  "duration_min" | "buffer_before_min" | "buffer_after_min"
>;

/**
 * Yer kaplamayan durumlar — `appointments_no_overlap` kısıtının `where`
 * ifadesiyle birebir aynı liste. Kısıt değişirse burası da değişir; ikisi
 * ayrışırsa motor veritabanının kabul edeceği slotu saklamaya başlar.
 */
export const NON_BLOCKING_STATUSES: readonly Enums<"appointment_status">[] = ["cancelled", "no_show"];

export function blocksTime(status: Enums<"appointment_status">): boolean {
  return !NON_BLOCKING_STATUSES.includes(status);
}

/**
 * `timestamptz` string'i `Date`'e. Bozuk değer sessizce `Invalid Date`
 * üretip aritmetiği `NaN`'a çevirmesin diye burada patlar.
 */
export function toDate(value: string, field = "zaman"): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Geçersiz ${field}: ${value}`);
  return date;
}

export function toInterval(row: { starts_at: string; ends_at: string }): Interval {
  return { start: toDate(row.starts_at, "starts_at"), end: toDate(row.ends_at, "ends_at") };
}

/**
 * Randevunun meşgul aralığı `starts_at`/`ends_at` değil `blocked_from`/
 * `blocked_to`'dur: tamponlar dahildir ve çakışma kısıtı da onun üzerinde.
 */
export function toBlockedInterval(row: { blocked_from: string; blocked_to: string }): Interval {
  return {
    start: toDate(row.blocked_from, "blocked_from"),
    end: toDate(row.blocked_to, "blocked_to"),
  };
}

export function toWorkingHour(row: WorkingHourRow): WorkingHour {
  return { weekday: row.weekday, startsAt: row.starts_at, endsAt: row.ends_at };
}

export function toServiceDuration(row: ServiceRow): ServiceDuration {
  return {
    durationMin: row.duration_min,
    bufferBeforeMin: row.buffer_before_min,
    bufferAfterMin: row.buffer_after_min,
  };
}

/**
 * Şubenin kendi zaman dilimi varsa o geçerli; yoksa kurumunki (şema
 * `branches.timezone` sütununu bunun için nullable bırakıyor).
 */
export function resolveTimeZone(
  branchTimeZone: string | null | undefined,
  tenantTimeZone: string,
): string {
  const branch = branchTimeZone?.trim();
  return branch ? branch : tenantTimeZone;
}

/**
 * Kaynak bazında motor girdisi. Her istenen kaynak için bir kayıt döner —
 * çalışma saati olmayan kaynak da haritada yer alır, çağıran `undefined`
 * kontrolü yapmak zorunda kalmasın.
 *
 * İstenmeyen kaynağa ait satırlar atılır: başka şubenin randevusu bu ızgaraya
 * sızmamalı.
 */
export function buildResourceSchedules({
  resourceIds,
  workingHours,
  timeOff = [],
  appointments = [],
}: {
  resourceIds: readonly string[];
  workingHours: readonly WorkingHourRow[];
  timeOff?: readonly TimeOffRow[];
  appointments?: readonly BlockingAppointmentRow[];
}): Map<string, ResourceSchedule> {
  const schedules = new Map<string, { workingHours: WorkingHour[]; timeOff: Interval[]; busy: Interval[] }>(
    resourceIds.map((id) => [id, { workingHours: [], timeOff: [], busy: [] }]),
  );

  for (const row of workingHours) {
    schedules.get(row.resource_id)?.workingHours.push(toWorkingHour(row));
  }
  for (const row of timeOff) {
    schedules.get(row.resource_id)?.timeOff.push(toInterval(row));
  }
  for (const row of appointments) {
    if (row.status && !blocksTime(row.status)) continue;
    schedules.get(row.resource_id)?.busy.push(toBlockedInterval(row));
  }

  return schedules;
}
