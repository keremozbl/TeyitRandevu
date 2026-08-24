/**
 * Takvimin veri katmanı.
 *
 * Supabase'e kullanıcının JWT'siyle gidilir (Kural 4): şube, kaynak ve randevu
 * filtrelemesini RLS yapar, buradaki `eq` çağrıları yalnızca istenen veriyi
 * daraltır — yetkiyi onlar sağlamaz.
 *
 * Zaman hesabı sunucuda biter: istemciye çalışma pencereleri ve randevular
 * hazır `Date` olarak gider, tarayıcının saat dilimi hiçbir şeyi etkilemez.
 */

import {
  computeOpenWindows,
  parseBookingRules,
  utcToPlainDate,
  zonedTimeToUtc,
  type BookingRules,
  type Interval,
  type PlainDate,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

import { buildResourceSchedules, resolveTimeZone, toBlockedInterval, toDate } from "./mappers";

export type BranchSummary = { id: string; name: string; timezone: string | null };

export type CalendarResource = {
  id: string;
  name: string;
  title: string | null;
  color: string | null;
  kind: Enums<"resource_kind">;
  isBookable: boolean;
};

export type CalendarAppointment = {
  id: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  blockedFrom: Date;
  blockedTo: Date;
  status: Enums<"appointment_status">;
  customerName: string | null;
  serviceName: string | null;
};

export type ResourceDay = {
  resource: CalendarResource;
  /** Çalışma saatleri eksi izinler — ızgarada açık zaman */
  openWindows: Interval[];
  /** İzinler ayrıca çizilir: "kapalı" ile "hiç çalışmıyor" farklı şeyler */
  timeOff: Interval[];
  appointments: CalendarAppointment[];
};

export type DaySchedule = {
  date: PlainDate;
  timeZone: string;
  branch: BranchSummary | null;
  branches: BranchSummary[];
  rules: BookingRules;
  resources: ResourceDay[];
  /** Yerel gün başlangıcı — ızgarada konum hesabı buna göre yapılır */
  dayStartsAt: Date;
  /** Izgaranın üst ve alt sınırı, gün başlangıcından itibaren dakika */
  gridFromMinutes: number;
  gridToMinutes: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60_000;

/** Izgara hiç veri yokken de bir yere oturmalı. */
const FALLBACK_FROM_MINUTES = 8 * 60;
const FALLBACK_TO_MINUTES = 20 * 60;

/** Query param'daki tarih; yoksa ya da bozuksa kurumun bugünü. */
export function resolveDate(raw: string | undefined, timeZone: string, now = new Date()): PlainDate {
  if (raw && DATE_RE.test(raw) && !Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
    return raw;
  }
  return utcToPlainDate(now, timeZone);
}

function minutesFrom(dayStart: Date, instant: Date): number {
  return (instant.getTime() - dayStart.getTime()) / MINUTE_MS;
}

/**
 * Izgaranın sınırları: en erken açılıştan en geç kapanışa, tam saate
 * yuvarlanmış. Mesai dışına düşen randevu (acil hasta) ızgaranın dışında
 * kalmasın diye randevular da hesaba katılır.
 */
function gridBounds(dayStart: Date, dayLengthMinutes: number, resources: ResourceDay[]) {
  const edges: number[] = [];
  for (const { openWindows, appointments } of resources) {
    for (const window of openWindows) {
      edges.push(minutesFrom(dayStart, window.start), minutesFrom(dayStart, window.end));
    }
    for (const appointment of appointments) {
      edges.push(minutesFrom(dayStart, appointment.startsAt), minutesFrom(dayStart, appointment.endsAt));
    }
  }

  if (edges.length === 0) {
    return { gridFromMinutes: FALLBACK_FROM_MINUTES, gridToMinutes: FALLBACK_TO_MINUTES };
  }

  const from = Math.floor(Math.min(...edges) / 60) * 60;
  const to = Math.ceil(Math.max(...edges) / 60) * 60;
  return {
    gridFromMinutes: Math.max(0, from),
    gridToMinutes: Math.min(dayLengthMinutes, Math.max(to, from + 60)),
  };
}

/**
 * Bir günün takvimi: şubenin kaynakları, açık zamanları, izinleri ve randevuları.
 */
export async function loadDaySchedule({
  tenantId,
  tenantTimeZone,
  date: rawDate,
  branchId,
}: {
  tenantId: string;
  tenantTimeZone: string;
  date?: string;
  branchId?: string;
}): Promise<DaySchedule> {
  const supabase = await createClient();

  const { data: branchRows, error: branchError } = await supabase
    .from("branches")
    .select("id, name, timezone")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (branchError) throw new Error(`Şubeler okunamadı: ${branchError.message}`);

  const branches: BranchSummary[] = branchRows ?? [];
  const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? null;
  const timeZone = resolveTimeZone(branch?.timezone, tenantTimeZone);
  const date = resolveDate(rawDate, timeZone);

  const dayStartsAt = zonedTimeToUtc(date, "00:00", timeZone);
  const dayEndsAt = zonedTimeToUtc(date, "24:00", timeZone);
  const dayLengthMinutes = minutesFrom(dayStartsAt, dayEndsAt);

  const assemble = (resources: ResourceDay[], rules: BookingRules): DaySchedule => ({
    date,
    timeZone,
    branch,
    branches,
    rules,
    resources,
    dayStartsAt,
    ...gridBounds(dayStartsAt, dayLengthMinutes, resources),
  });

  const settingsQuery = supabase
    .from("tenant_settings")
    .select("booking_rules")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!branch) {
    const { data: settings } = await settingsQuery;
    return assemble([], parseBookingRules(settings?.booking_rules));
  }

  const [{ data: settings }, { data: resourceRows, error: resourceError }] = await Promise.all([
    settingsQuery,
    supabase
      .from("resources")
      .select("id, name, title, color, kind, is_bookable")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);
  if (resourceError) throw new Error(`Kaynaklar okunamadı: ${resourceError.message}`);

  const rules = parseBookingRules(settings?.booking_rules);
  const resources: CalendarResource[] = (resourceRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title,
    color: row.color,
    kind: row.kind,
    isBookable: row.is_bookable,
  }));
  const resourceIds = resources.map((r) => r.id);

  if (resourceIds.length === 0) return assemble([], rules);

  const dayStartIso = dayStartsAt.toISOString();
  const dayEndIso = dayEndsAt.toISOString();

  const [workingHoursResult, timeOffResult, appointmentsResult] = await Promise.all([
    supabase
      .from("working_hours")
      .select("resource_id, weekday, starts_at, ends_at")
      .in("resource_id", resourceIds),
    // Yarı açık kesişim: günün sonunda başlayan ya da başında biten izin sayılmaz
    supabase
      .from("time_off")
      .select("resource_id, starts_at, ends_at")
      .in("resource_id", resourceIds)
      .lt("starts_at", dayEndIso)
      .gt("ends_at", dayStartIso),
    // Tamponlu aralık üzerinden: 08:55'te başlayan hazırlık da bugüne düşer
    supabase
      .from("appointments")
      .select(
        "id, resource_id, starts_at, ends_at, blocked_from, blocked_to, status, customers(full_name), services(name)",
      )
      .in("resource_id", resourceIds)
      .lt("blocked_from", dayEndIso)
      .gt("blocked_to", dayStartIso)
      .order("starts_at"),
  ]);

  for (const [label, result] of [
    ["Çalışma saatleri", workingHoursResult],
    ["İzinler", timeOffResult],
    ["Randevular", appointmentsResult],
  ] as const) {
    if (result.error) throw new Error(`${label} okunamadı: ${result.error.message}`);
  }

  const appointmentRows = appointmentsResult.data ?? [];

  const schedules = buildResourceSchedules({
    resourceIds,
    workingHours: workingHoursResult.data ?? [],
    timeOff: timeOffResult.data ?? [],
    appointments: appointmentRows,
  });

  const appointments: CalendarAppointment[] = appointmentRows.map((row) => {
    const blocked = toBlockedInterval(row);
    return {
      id: row.id,
      resourceId: row.resource_id,
      startsAt: toDate(row.starts_at, "starts_at"),
      endsAt: toDate(row.ends_at, "ends_at"),
      blockedFrom: blocked.start,
      blockedTo: blocked.end,
      status: row.status,
      customerName: row.customers?.full_name ?? null,
      serviceName: row.services?.name ?? null,
    };
  });

  const resourceDays: ResourceDay[] = resources.map((resource) => {
    const schedule = schedules.get(resource.id) ?? { workingHours: [], timeOff: [], busy: [] };
    return {
      resource,
      openWindows: computeOpenWindows(date, timeZone, schedule),
      timeOff: [...(schedule.timeOff ?? [])],
      appointments: appointments.filter((a) => a.resourceId === resource.id),
    };
  });

  return assemble(resourceDays, rules);
}
