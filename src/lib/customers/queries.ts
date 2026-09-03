/**
 * Hasta kartının veri katmanı.
 *
 * Supabase'e kullanıcının JWT'siyle gidilir (Kural 4): hangi hastanın
 * görüneceğini `customer.read` izni ve RLS söyler, buradaki `eq` çağrıları
 * yalnızca istenen veriyi daraltır.
 *
 * Tıbbi notlar ayrı tablodadır ve ayrı politikayla korunur (Kural 8). Yetkisi
 * olmayan kullanıcı için sorgu boş döner; "not yok" ile "yetkin yok" arasını
 * `loadPermissions()` ayırır.
 */

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/session";
import { utcToPlainDate, type PlainDate } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

import { parseOptions, type FieldDefinition, type FieldKind } from "./fields";

export type CustomerRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  noShowCount: number;
  createdAt: Date;
  /** Bugünden sonraki ilk randevusu; yoksa null */
  nextVisitAt: Date | null;
};

export type CustomerListPage = {
  rows: CustomerRow[];
  /** Aramaya uyan toplam kayıt; sayfalama bunun üzerinden */
  total: number;
  page: number;
  pageSize: number;
  search: string;
};

export type CustomerVisit = {
  id: string;
  startsAt: Date;
  date: PlainDate;
  status: Enums<"appointment_status">;
  resourceName: string | null;
  serviceName: string | null;
  branchId: string | null;
};

export type MedicalNote = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  resourceName: string | null;
};

export type CustomerDetail = {
  id: string;
  branchId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  notes: string | null;
  tags: string[];
  customData: Record<string, unknown>;
  noShowCount: number;
  isActive: boolean;
  anonymizedAt: Date | null;
  source: string | null;
  createdAt: Date;
};

export type CustomerCard = {
  customer: CustomerDetail;
  /** Gelecek randevular, yakından uzağa */
  upcoming: CustomerVisit[];
  /** Geçmiş randevular, yeniden eskiye */
  past: CustomerVisit[];
  /** Yetki yoksa boş dizi — ayrımı çağıran yapar */
  medicalNotes: MedicalNote[];
  fields: FieldDefinition[];
  timeZone: string;
};

export const CUSTOMER_PAGE_SIZE = 50;

/**
 * Gelecek randevu araması bu kadarını okur. Tek sayfadaki elli hastanın
 * ileriye dönük randevusu bunun altında kalır; klinik ölçeğinde ileri tarihli
 * randevu sayısı zaten sınırlı.
 */
const UPCOMING_SCAN_LIMIT = 300;

/**
 * PostgREST'in `or` filtresi virgülle ayrılır ve parantezle gruplanır; arama
 * metnindeki bu karakterler filtreyi bozar. Kullanıcı ne yazarsa yazsın
 * sorgunun yapısını değiştiremesin diye ayıklanıyorlar.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%\\"']/g, " ").trim().slice(0, 60);
}

function toDate(value: string): Date {
  return new Date(value);
}

/** Hasta listesi: ada ve telefona göre arama, sayfalı. */
export async function loadCustomerList({
  tenantId,
  search,
  page = 1,
  pageSize = CUSTOMER_PAGE_SIZE,
}: {
  tenantId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerListPage> {
  const supabase = await createClient();
  const term = sanitizeSearch(search ?? "");
  const digits = term.replace(/\D/g, "");
  const current = Math.max(1, Math.floor(page));
  const from = (current - 1) * pageSize;

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email, tags, no_show_count, created_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (term) {
    const filters = [`full_name.ilike.%${term}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));
  }

  const { data, error, count } = await query
    .order("full_name")
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Hastalar okunamadı: ${error.message}`);

  const rows = data ?? [];
  const nextVisits = await loadNextVisits(rows.map((row) => row.id));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      tags: row.tags ?? [],
      noShowCount: row.no_show_count,
      createdAt: toDate(row.created_at),
      nextVisitAt: nextVisits.get(row.id) ?? null,
    })),
    total: count ?? rows.length,
    page: current,
    pageSize,
    search: term,
  };
}

/** Listedeki hastaların bir sonraki randevusu — hasta başına tek sorgu değil, tek tur. */
async function loadNextVisits(customerIds: string[]): Promise<Map<string, Date>> {
  const found = new Map<string, Date>();
  if (customerIds.length === 0) return found;

  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("customer_id, starts_at")
    .in("customer_id", customerIds)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(UPCOMING_SCAN_LIMIT);

  for (const row of data ?? []) {
    if (!row.customer_id || found.has(row.customer_id)) continue;
    found.set(row.customer_id, toDate(row.starts_at));
  }
  return found;
}

/** Tek hastanın kartı: kayıt, randevu geçmişi, tıbbi notlar ve esnek alanlar. */
export async function loadCustomerCard({
  tenantId,
  customerId,
  timeZone,
  withMedicalNotes,
}: {
  tenantId: string;
  customerId: string;
  timeZone: string;
  /** Yetki yoksa sorgu hiç atılmaz; boş sonucu yorumlamak çağıranın işi olmasın */
  withMedicalNotes: boolean;
}): Promise<CustomerCard | null> {
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, branch_id, full_name, phone, email, birth_date, notes, tags, custom_data, no_show_count, is_active, anonymized_at, source, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return null;

  const [visitResult, noteResult, fieldResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, status, branch_id, resources(name), services(name)")
      .eq("customer_id", customerId)
      .order("starts_at", { ascending: false })
      .limit(100),
    withMedicalNotes
      ? supabase
          .from("customer_medical_notes")
          .select("id, body, created_at, updated_at, resources(name)")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("field_definitions")
      .select("key, label, kind, is_required, is_medical, options, sort_order")
      .eq("tenant_id", tenantId)
      .eq("entity", "customer")
      .order("sort_order")
      .order("label"),
  ]);

  // Denetim kaydı sayfada değil BURADA yazılıyor: kartı okuyan her yol bu
  // fonksiyondan geçer, o yüzden kaydı düşürmeyi unutmak mümkün olmasın
  // (KVKK Bölüm 12.4). `requireUser` istek başına önbellekli, ek tur yok.
  const notes = noteResult.data ?? [];
  const { user } = await requireUser();
  await recordAudit([
    {
      tenantId,
      actorId: user.id,
      action: "read",
      entity: "customer",
      entityId: customer.id,
    },
    // Tıbbi not okuması ayrı bir satır: "hasta kartını açtı" ile "tedavi
    // notunu okudu" hukuken de pratikte de farklı iki olay. Not yoksa
    // okuma da yok — boş sonuç kayıt üretmez.
    ...(notes.length > 0
      ? [
          {
            tenantId,
            actorId: user.id,
            action: "read" as const,
            entity: "customer_medical_note" as const,
            entityId: customer.id,
            detail: { count: notes.length },
          },
        ]
      : []),
  ]);

  const now = Date.now();
  const visits: CustomerVisit[] = (visitResult.data ?? []).map((row) => ({
    id: row.id,
    startsAt: toDate(row.starts_at),
    date: utcToPlainDate(toDate(row.starts_at), timeZone),
    status: row.status,
    resourceName: row.resources?.name ?? null,
    serviceName: row.services?.name ?? null,
    branchId: row.branch_id,
  }));

  return {
    customer: {
      id: customer.id,
      branchId: customer.branch_id,
      fullName: customer.full_name,
      phone: customer.phone,
      email: customer.email,
      birthDate: customer.birth_date,
      notes: customer.notes,
      tags: customer.tags ?? [],
      customData: (customer.custom_data ?? {}) as Record<string, unknown>,
      noShowCount: customer.no_show_count,
      isActive: customer.is_active,
      /** KVKK imhası uygulandıysa dolu — kart salt okunur gösterilir */
      anonymizedAt: customer.anonymized_at ? toDate(customer.anonymized_at) : null,
      source: customer.source,
      createdAt: toDate(customer.created_at),
    },
    // Gelecek yakından uzağa okunur: sıradaki randevu en üstte olsun
    upcoming: visits.filter((visit) => visit.startsAt.getTime() >= now).reverse(),
    past: visits.filter((visit) => visit.startsAt.getTime() < now),
    medicalNotes: notes.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: toDate(row.created_at),
      updatedAt: toDate(row.updated_at),
      resourceName: row.resources?.name ?? null,
    })),
    fields: (fieldResult.data ?? []).map(toFieldDefinition),
    timeZone,
  };
}

/** Hasta kaydı bir şubeye bağlanır; 'branch' kapsamlı yetkiler ona bakıyor. */
export async function loadBranchOptions(
  tenantId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

/** Kurumun hasta alanları — yeni hasta formu da bunları soruyor. */
export async function loadCustomerFields(tenantId: string): Promise<FieldDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("field_definitions")
    .select("key, label, kind, is_required, is_medical, options, sort_order")
    .eq("tenant_id", tenantId)
    .eq("entity", "customer")
    .order("sort_order")
    .order("label");
  return (data ?? []).map(toFieldDefinition);
}

function toFieldDefinition(row: {
  key: string;
  label: string;
  kind: FieldKind;
  is_required: boolean;
  is_medical: boolean;
  options: unknown;
}): FieldDefinition {
  return {
    key: row.key,
    label: row.label,
    kind: row.kind,
    isRequired: row.is_required,
    isMedical: row.is_medical,
    options: parseOptions(row.options),
  };
}

/**
 * Aynı numara başka bir hastada kayıtlı mı?
 *
 * Veritabanında telefon için tekillik kısıtı yok — bilerek: aynı numarayı
 * paylaşan aile üyeleri gerçek bir durum. Ama resepsiyonun aynı hastayı ikinci
 * kez açtığını fark etmesi gerekiyor, o yüzden uyarılır, engellenmez.
 */
export async function findByPhone(
  tenantId: string,
  phone: string,
  exceptId?: string,
): Promise<{ id: string; fullName: string } | null> {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .eq("is_active", true);
  if (exceptId) query = query.neq("id", exceptId);

  const { data } = await query.limit(1).maybeSingle();
  return data ? { id: data.id, fullName: data.full_name } : null;
}
