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
  addDays,
  computeAvailability,
  computeOpenWindows,
  nearestSlot,
  parseBookingRules,
  utcToPlainDate,
  zonedTimeToUtc,
  type BookingRules,
  type Interval,
  type PlainDate,
  type ServiceDuration,
  type Slot,
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
  /** Public sayfada doldurulmayı bekleyen slot tutması — henüz randevu değil */
  isHold: boolean;
};

export type ResourceDay = {
  resource: CalendarResource;
  /** Izgarada tıklanabilir boş yarım saatlerin başlangıçları */
  freeSlots: Date[];
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

/** Izgaranın tıklanabilir adımı; --slot-h ile aynı ölçek. */
const GRID_SLOT_MINUTES = 30;

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

  // Üçü de birbirinden bağımsız; aynı anda sorulur. Her ek tur, sunucu ile
  // veritabanı arasındaki gidiş dönüş kadar gecikme demek — sayfanın süresi
  // sorguların hızından çok kaç kere sıraya girdiğine bağlı.
  const [branchesResult, settingsResult, resourceResult] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, timezone")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("tenant_settings")
      .select("booking_rules")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    // Şube henüz seçilmediği için kurumun tüm kaynakları çekilip burada süzülür:
    // şubeyi bekleyip ayrı sormak bir tur daha ekliyordu.
    supabase
      .from("resources")
      .select("id, branch_id, name, title, color, kind, is_bookable")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);
  if (branchesResult.error) throw new Error(`Şubeler okunamadı: ${branchesResult.error.message}`);
  if (resourceResult.error) throw new Error(`Kaynaklar okunamadı: ${resourceResult.error.message}`);

  const branches: BranchSummary[] = branchesResult.data ?? [];
  const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? null;
  const timeZone = resolveTimeZone(branch?.timezone, tenantTimeZone);
  const date = resolveDate(rawDate, timeZone);
  const rules = parseBookingRules(settingsResult.data?.booking_rules);

  const dayStartsAt = zonedTimeToUtc(date, "00:00", timeZone);
  const dayEndsAt = zonedTimeToUtc(date, "24:00", timeZone);
  const dayLengthMinutes = minutesFrom(dayStartsAt, dayEndsAt);

  const assemble = (resourceDays: ResourceDay[]): DaySchedule => ({
    date,
    timeZone,
    branch,
    branches,
    rules,
    resources: resourceDays,
    dayStartsAt,
    ...gridBounds(dayStartsAt, dayLengthMinutes, resourceDays),
  });

  if (!branch) return assemble([]);

  const resources: CalendarResource[] = (resourceResult.data ?? [])
    .filter((row) => row.branch_id === branch.id)
    .map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      color: row.color,
      kind: row.kind,
      isBookable: row.is_bookable,
    }));
  const resourceIds = resources.map((r) => r.id);

  if (resourceIds.length === 0) return assemble([]);

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
        "id, resource_id, starts_at, ends_at, blocked_from, blocked_to, status, hold_expires_at, customers(full_name), services(name)",
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

  // Süresi dolmuş slot tutmaları ızgarada görünmez: onlar ölü satır, bir
  // sonraki yazmada silinecekler (private.sweep_expired_holds). Görünselerdi
  // resepsiyon dolu sanıp boş bir saati atlardı.
  const now = Date.now();
  const appointmentRows = (appointmentsResult.data ?? []).filter(
    (row) => !row.hold_expires_at || new Date(row.hold_expires_at).getTime() > now,
  );

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
      isHold: row.hold_expires_at !== null,
    };
  });

  const resourceDays: ResourceDay[] = resources.map((resource) => {
    const schedule = schedules.get(resource.id) ?? { workingHours: [], timeOff: [], busy: [] };
    // Boş slotlar motordan gelir; ızgara kendi çakışma mantığını kurmaz.
    // Kural verilmiyor: personel minimum ön süreye tabi değil, geçmiş saate de
    // kayıt açabilir (gelen hastayı sonradan işlemek yaygın).
    const [availability] = computeAvailability({
      timeZone,
      from: date,
      to: date,
      schedule,
      service: { durationMin: GRID_SLOT_MINUTES },
      stepMinutes: GRID_SLOT_MINUTES,
    });

    return {
      resource,
      freeSlots: availability.slots.map((slot) => slot.startsAt),
      openWindows: computeOpenWindows(date, timeZone, schedule),
      timeOff: [...(schedule.timeOff ?? [])],
      appointments: appointments.filter((a) => a.resourceId === resource.id),
    };
  });

  return assemble(resourceDays);
}

export type ServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
};

export type CustomerOption = { id: string; fullName: string; phone: string | null };

export type BookingContext = {
  branch: BranchSummary;
  timeZone: string;
  rules: BookingRules;
  resources: CalendarResource[];
  services: ServiceOption[];
  /** Arama sonucu ya da arama yoksa son eklenen hastalar */
  customers: CustomerOption[];
};

/**
 * PostgREST'in `or` filtresi virgülle ayrılır ve parantezle gruplanır; arama
 * metnindeki bu karakterler filtreyi bozar. Kullanıcı ne yazarsa yazsın
 * sorgunun yapısını değiştiremesin diye ayıklanıyorlar.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%\\"']/g, " ").trim().slice(0, 60);
}

/** Randevu formunun ihtiyaç duyduğu her şey: kaynaklar, hizmetler, hastalar. */
export async function loadBookingContext({
  tenantId,
  tenantTimeZone,
  branchId,
  search,
  withCustomers = true,
  pinnedCustomerId,
}: {
  tenantId: string;
  tenantTimeZone: string;
  branchId?: string;
  search?: string;
  /** Düzenleme ekranı hasta seçmiyor; gereksiz yere hasta adı okumayalım. */
  withCustomers?: boolean;
  /** Hasta kartından gelindiğinde o hasta listede olmalı, aramaya bağlı kalmasın */
  pinnedCustomerId?: string;
}): Promise<BookingContext | null> {
  const supabase = await createClient();

  const { data: branchRows, error: branchError } = await supabase
    .from("branches")
    .select("id, name, timezone")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (branchError) throw new Error(`Şubeler okunamadı: ${branchError.message}`);

  const branches: BranchSummary[] = branchRows ?? [];
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  if (!branch) return null;

  const term = sanitizeSearch(search ?? "");
  const digits = term.replace(/\D/g, "");

  let customerQuery = supabase
    .from("customers")
    .select("id, full_name, phone")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (term) {
    const filters = [`full_name.ilike.%${term}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    customerQuery = customerQuery.or(filters.join(",")).order("full_name").limit(20);
  } else {
    customerQuery = customerQuery.order("created_at", { ascending: false }).limit(8);
  }

  const [settingsResult, resourceResult, serviceResult, customerResult] = await Promise.all([
    supabase.from("tenant_settings").select("booking_rules").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("resources")
      .select("id, name, title, color, kind, is_bookable")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .eq("is_bookable", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("services")
      .select("id, name, duration_min, buffer_before_min, buffer_after_min")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    withCustomers ? customerQuery : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [label, result] of [
    ["Kaynaklar", resourceResult],
    ["Hizmetler", serviceResult],
    ["Hastalar", customerResult],
  ] as const) {
    if (result.error) throw new Error(`${label} okunamadı: ${result.error.message}`);
  }

  const customers = (customerResult.data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
  }));

  // Kartından randevu verilen hasta aramanın ilk yirmisine düşmeyebilir;
  // düşmezse form onu hiç göstermez ve seçim sessizce kaybolur.
  if (pinnedCustomerId && !customers.some((person) => person.id === pinnedCustomerId)) {
    const { data: pinned } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .eq("tenant_id", tenantId)
      .eq("id", pinnedCustomerId)
      .maybeSingle();
    if (pinned) {
      customers.unshift({ id: pinned.id, fullName: pinned.full_name, phone: pinned.phone });
    }
  }

  return {
    branch,
    timeZone: resolveTimeZone(branch.timezone, tenantTimeZone),
    rules: parseBookingRules(settingsResult.data?.booking_rules),
    resources: (resourceResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      color: row.color,
      kind: row.kind,
      isBookable: row.is_bookable,
    })),
    services: (serviceResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      durationMin: row.duration_min,
      bufferBeforeMin: row.buffer_before_min,
      bufferAfterMin: row.buffer_after_min,
    })),
    customers,
  };
}

/**
 * Çakışma hatasından sonra önerilecek saat. Aynı günden başlar, o gün hiç yer
 * yoksa bir hafta ileriye bakar — "yer yok" demek yerine bir tarih vermek
 * resepsiyonu telefonda bekletmez.
 */
export async function findNearestSlot({
  resourceId,
  date,
  timeZone,
  service,
  target,
  stepMinutes,
}: {
  resourceId: string;
  date: PlainDate;
  timeZone: string;
  service: ServiceDuration;
  target: Date;
  stepMinutes?: number;
}): Promise<Slot | null> {
  const supabase = await createClient();
  const to = addDays(date, 7);
  const rangeStart = zonedTimeToUtc(date, "00:00", timeZone).toISOString();
  const rangeEnd = zonedTimeToUtc(addDays(to, 1), "00:00", timeZone).toISOString();

  const [workingHoursResult, timeOffResult, appointmentsResult] = await Promise.all([
    supabase
      .from("working_hours")
      .select("resource_id, weekday, starts_at, ends_at")
      .eq("resource_id", resourceId),
    supabase
      .from("time_off")
      .select("resource_id, starts_at, ends_at")
      .eq("resource_id", resourceId)
      .lt("starts_at", rangeEnd)
      .gt("ends_at", rangeStart),
    supabase
      .from("appointments")
      .select("resource_id, blocked_from, blocked_to, status")
      .eq("resource_id", resourceId)
      .lt("blocked_from", rangeEnd)
      .gt("blocked_to", rangeStart),
  ]);

  if (workingHoursResult.error || timeOffResult.error || appointmentsResult.error) return null;

  const schedule = buildResourceSchedules({
    resourceIds: [resourceId],
    workingHours: workingHoursResult.data ?? [],
    timeOff: timeOffResult.data ?? [],
    appointments: appointmentsResult.data ?? [],
  }).get(resourceId);
  if (!schedule) return null;

  const days = computeAvailability({
    timeZone,
    from: date,
    to,
    schedule,
    service,
    stepMinutes,
  });

  return nearestSlot(days, target);
}

export type AppointmentDetail = {
  id: string;
  tenantId: string;
  branchId: string;
  resourceId: string;
  serviceId: string | null;
  customerId: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Kurumun zaman dilimindeki gün ve saat — form alanları buradan dolar */
  date: PlainDate;
  time: string;
  durationMin: number;
  status: Enums<"appointment_status">;
  notes: string | null;
  cancelledReason: string | null;
  customerName: string | null;
  customerPhone: string | null;
  serviceName: string | null;
  resourceName: string;
  branchName: string;
  timeZone: string;
};

/** Tek randevunun düzenleme ekranı için tam hâli. RLS görmeye yetkiyi verir. */
export async function loadAppointment(
  id: string,
  tenantTimeZone: string,
): Promise<AppointmentDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, tenant_id, branch_id, resource_id, service_id, customer_id, starts_at, ends_at, status, notes, cancelled_reason, customers(full_name, phone), services(name), resources(name, title), branches(name, timezone)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const timeZone = resolveTimeZone(data.branches?.timezone, tenantTimeZone);
  const startsAt = toDate(data.starts_at, "starts_at");
  const endsAt = toDate(data.ends_at, "ends_at");

  return {
    id: data.id,
    tenantId: data.tenant_id,
    branchId: data.branch_id,
    resourceId: data.resource_id,
    serviceId: data.service_id,
    customerId: data.customer_id,
    startsAt,
    endsAt,
    date: utcToPlainDate(startsAt, timeZone),
    time: new Intl.DateTimeFormat("tr-TR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(startsAt),
    durationMin: Math.round((endsAt.getTime() - startsAt.getTime()) / MINUTE_MS),
    status: data.status,
    notes: data.notes,
    cancelledReason: data.cancelled_reason,
    customerName: data.customers?.full_name ?? null,
    customerPhone: data.customers?.phone ?? null,
    serviceName: data.services?.name ?? null,
    resourceName: [data.resources?.title, data.resources?.name].filter(Boolean).join(" "),
    branchName: data.branches?.name ?? "",
    timeZone,
  };
}
