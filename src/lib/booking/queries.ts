/**
 * Public randevu sayfasının veri katmanı.
 *
 * Panelden farkı: burada `supabase.from(...)` YOK. `anon` rolünün hiçbir
 * tabloda yetkisi olmadığı için her şey `booking_*` fonksiyonları üzerinden
 * gelir (supabase/schemas/70_public_booking.sql). Fonksiyonlar `jsonb`
 * döndürdüğü için tipler üretilmiş şemadan gelmiyor — gelen yapı zod ile
 * doğrulanıyor. Bozuk ya da eksik bir alan sayfanın ortasında `undefined`
 * olarak patlamak yerine burada yakalanır.
 *
 * Uygunluk hesabı BURADA YAPILMAZ, motora (`src/lib/domain`) verilir: panelin
 * ızgarası ile public sayfanın slot listesi aynı kodun çıktısıdır. İkinci bir
 * motor yazmak, ikisinin farklı cevap verdiği ilk günde çift rezervasyon
 * demektir.
 */

import { cache } from "react";
import { z } from "zod";

import {
  addDays,
  computeAvailability,
  mergeResourceAvailability,
  parseBookingRules,
  zonedTimeToUtc,
  type BookingRules,
  type PlainDate,
  type SharedSlot,
} from "@/lib/domain";
import { buildResourceSchedules, toDate, resolveTimeZone } from "@/lib/scheduling/mappers";
import { createPublicClient } from "@/lib/supabase/public";

// -----------------------------------------------------------------------------
// Gelen jsonb'nin şeması
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const branchSchema = z.object({
  id: uuid,
  name: z.string(),
  address: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  timezone: z.string().nullable().default(null),
});

const resourceSchema = z.object({
  id: uuid,
  branch_id: uuid,
  name: z.string(),
  title: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  kind: z.string(),
});

const serviceSchema = z.object({
  id: uuid,
  name: z.string(),
  category: z.string().nullable().default(null),
  duration_min: z.number().int(),
  buffer_before_min: z.number().int().default(0),
  buffer_after_min: z.number().int().default(0),
  price: z.number().nullable().default(null),
  resource_ids: z.array(uuid).default([]),
});

const pageSchema = z.object({
  tenant: z.object({
    id: uuid,
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    locale: z.string(),
    currency: z.string(),
    family: z.string(),
    business_type: z.string(),
  }),
  branding: z.record(z.string(), z.unknown()).default({}),
  rules: z.unknown(),
  branches: z.array(branchSchema).default([]),
  resources: z.array(resourceSchema).default([]),
  services: z.array(serviceSchema).default([]),
});

const availabilitySchema = z.object({
  working_hours: z
    .array(
      z.object({
        resource_id: uuid,
        weekday: z.number().int(),
        starts_at: z.string(),
        ends_at: z.string(),
      }),
    )
    .default([]),
  time_off: z
    .array(z.object({ resource_id: uuid, starts_at: z.string(), ends_at: z.string() }))
    .default([]),
  busy: z
    .array(z.object({ resource_id: uuid, blocked_from: z.string(), blocked_to: z.string() }))
    .default([]),
});

const lookupSchema = z.object({
  ok: z.literal(true),
  token: uuid,
  status: z.string(),
  hold_expires_at: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  timezone: z.string(),
  cancel_window_minutes: z.number().int(),
  tenant: z.object({ name: z.string(), slug: z.string() }),
  branch: z.object({
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  service: z
    .object({ id: uuid, name: z.string(), duration_min: z.number().int() })
    .nullable(),
  resource: z.object({ name: z.string(), title: z.string().nullable() }),
  customer: z.object({ full_name: z.string(), phone: z.string().nullable() }).nullable(),
});

// -----------------------------------------------------------------------------
// Dışa verilen tipler — arayüz camelCase konuşur
// -----------------------------------------------------------------------------

export type PublicBranch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timeZone: string;
};

export type PublicResource = {
  id: string;
  branchId: string;
  name: string;
  title: string | null;
  color: string | null;
  /** "Dt. Ayşe Yılmaz" — başlık varsa başında */
  label: string;
};

export type PublicService = {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: number | null;
  /** Boş = bu hizmeti her kaynak verebilir */
  resourceIds: string[];
};

export type BookingPage = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timeZone: string;
    currency: string;
  };
  rules: BookingRules;
  branches: PublicBranch[];
  resources: PublicResource[];
  services: PublicService[];
};

export function resourceLabel(name: string, title: string | null): string {
  return [title, name].filter(Boolean).join(" ");
}

/** Kurumun public sayfası. Slug yoksa ya da kurum yayında değilse null. */
export async function loadBookingPage(slug: string): Promise<BookingPage | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_page", { _slug: slug });

  if (error) throw new Error(`Randevu sayfası okunamadı: ${error.message}`);
  if (data === null) return null;

  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error("Randevu sayfası verisi beklenen biçimde değil.");
  const page = parsed.data;

  const tenantTimeZone = page.tenant.timezone;

  return {
    tenant: {
      id: page.tenant.id,
      name: page.tenant.name,
      slug: page.tenant.slug,
      timeZone: tenantTimeZone,
      currency: page.tenant.currency,
    },
    rules: parseBookingRules(page.rules),
    branches: page.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      timeZone: resolveTimeZone(branch.timezone, tenantTimeZone),
    })),
    resources: page.resources.map((resource) => ({
      id: resource.id,
      branchId: resource.branch_id,
      name: resource.name,
      title: resource.title,
      color: resource.color,
      label: resourceLabel(resource.name, resource.title),
    })),
    services: page.services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      durationMin: service.duration_min,
      bufferBeforeMin: service.buffer_before_min,
      bufferAfterMin: service.buffer_after_min,
      price: service.price,
      resourceIds: service.resource_ids,
    })),
  };
}

/**
 * Aynı istek içinde sayfa ve layout ikisi de kurumu okuyor; `cache` ikinci
 * çağrıyı veritabanına hiç göndermez. Her tur, sunucu ile Frankfurt arasında
 * ~110 ms demek (CANLIYA-GECIS B8).
 */
export const getBookingPage = cache(loadBookingPage);

export type PublicDay = { date: PlainDate; slots: SharedSlot[] };

/**
 * Seçilen hizmet ve kaynaklar için gün gün uygun saatler.
 *
 * `rules` motora VERİLİR: public sayfa minimum ön süreye ve ileri tarih
 * sınırına tabidir (panel değildir — personel geçmiş saate de kayıt açabilir).
 * Aynı kurallar `booking_hold` içinde SQL tarafında da uygulanıyor; buradaki
 * kolaylık, oradaki kapı.
 */
export async function loadPublicAvailability({
  slug,
  resources,
  service,
  timeZone,
  from,
  to,
  rules,
  now,
}: {
  slug: string;
  resources: readonly string[];
  service: Pick<PublicService, "durationMin" | "bufferBeforeMin" | "bufferAfterMin">;
  timeZone: string;
  from: PlainDate;
  to: PlainDate;
  rules: BookingRules;
  now?: Date;
}): Promise<PublicDay[]> {
  if (resources.length === 0) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_availability", {
    _slug: slug,
    _resource_ids: [...resources],
    // Tampon süreler günün dışına taşabilir: bir gün öncesinden bir gün
    // sonrasına kadar bakılır, yoksa sınırdaki randevu görünmez ve motor
    // veritabanının reddedeceği slotu gösterir.
    _from: zonedTimeToUtc(addDays(from, -1), "00:00", timeZone).toISOString(),
    _to: zonedTimeToUtc(addDays(to, 2), "00:00", timeZone).toISOString(),
  });

  if (error) throw new Error(`Uygunluk okunamadı: ${error.message}`);
  if (data === null) return [];

  const parsed = availabilitySchema.safeParse(data);
  if (!parsed.success) throw new Error("Uygunluk verisi beklenen biçimde değil.");

  // `busy` satırlarında durum yok: fonksiyon iptal ve gelmedi olanları zaten
  // elemiş, dışarı yalnız "şu aralık dolu" bilgisi çıkıyor.
  const schedules = buildResourceSchedules({
    resourceIds: resources,
    workingHours: parsed.data.working_hours,
    timeOff: parsed.data.time_off,
    appointments: parsed.data.busy,
  });

  return mergeResourceAvailability(
    [...schedules.entries()].map(([resourceId, schedule]) => ({
      resourceId,
      days: computeAvailability({
        timeZone,
        from,
        to,
        schedule,
        service: {
          durationMin: service.durationMin,
          bufferBeforeMin: service.bufferBeforeMin,
          bufferAfterMin: service.bufferAfterMin,
        },
        rules,
        now,
      }),
    })),
  );
}

export type BookingSummary = {
  token: string;
  status: string;
  /** Dolu ise slot hâlâ tutuluyor, randevu henüz onaylanmadı */
  holdExpiresAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  cancelWindowMinutes: number;
  tenantName: string;
  tenantSlug: string;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  serviceName: string | null;
  resourceLabel: string;
  customerName: string | null;
  customerPhone: string | null;
};

/** Bağlantıdaki token'la randevunun public görünümü. */
export async function lookupBooking(token: string): Promise<BookingSummary | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_lookup", { _token: token });

  if (error) throw new Error(`Randevu okunamadı: ${error.message}`);
  if (data === null) return null;

  const parsed = lookupSchema.safeParse(data);
  if (!parsed.success) return null;
  const row = parsed.data;

  return {
    token: row.token,
    status: row.status,
    holdExpiresAt: row.hold_expires_at ? toDate(row.hold_expires_at, "hold_expires_at") : null,
    startsAt: toDate(row.starts_at, "starts_at"),
    endsAt: toDate(row.ends_at, "ends_at"),
    timeZone: row.timezone,
    cancelWindowMinutes: row.cancel_window_minutes,
    tenantName: row.tenant.name,
    tenantSlug: row.tenant.slug,
    branchName: row.branch.name,
    branchAddress: row.branch.address,
    branchPhone: row.branch.phone,
    serviceName: row.service?.name ?? null,
    resourceLabel: resourceLabel(row.resource.name, row.resource.title),
    customerName: row.customer?.full_name ?? null,
    customerPhone: row.customer?.phone ?? null,
  };
}
