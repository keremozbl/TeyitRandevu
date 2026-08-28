/**
 * Hizmet kataloğunun veri katmanı.
 *
 * Okuma kurum içinde herkese açık (randevu yazan herkesin görmesi gerek),
 * yazma `service.manage` iznine bağlı — ikisini de RLS söylüyor (Kural 3).
 *
 * `service_resources` hangi hizmeti hangi kaynağın verebildiğini tutar. Boş
 * bırakılmışsa kısıt yok demektir: her kaynak verebilir. Bu ayrım önemli,
 * çünkü "hiç kaynak seçilmemiş" ile "hiçbir kaynak veremez" aynı şey değil.
 */

import { createClient } from "@/lib/supabase/server";

export type CatalogService = {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: number | null;
  vatRate: number;
  color: string | null;
  isOnlineBookable: boolean;
  isActive: boolean;
  sortOrder: number;
  /** Bu hizmeti verebilen kaynaklar; boş = kısıt yok */
  resourceIds: string[];
};

const COLUMNS =
  "id, name, category, duration_min, buffer_before_min, buffer_after_min, price, vat_rate, color, is_online_bookable, is_active, sort_order";

type ServiceRow = {
  id: string;
  name: string;
  category: string | null;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price: number | string | null;
  vat_rate: number | string;
  color: string | null;
  is_online_bookable: boolean;
  is_active: boolean;
  sort_order: number;
};

/** numeric sütunlar PostgREST'ten metin de gelebilir; sayıya burada çevrilir. */
const toNumber = (value: number | string | null): number | null => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function toService(row: ServiceRow, resourceIds: string[]): CatalogService {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    durationMin: row.duration_min,
    bufferBeforeMin: row.buffer_before_min,
    bufferAfterMin: row.buffer_after_min,
    price: toNumber(row.price),
    vatRate: toNumber(row.vat_rate) ?? 0,
    color: row.color,
    isOnlineBookable: row.is_online_bookable,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    resourceIds,
  };
}

/** Kurumun tüm hizmetleri; pasifler de listelenir, ayrı işaretlenir. */
export async function loadServices(tenantId: string): Promise<CatalogService[]> {
  const supabase = await createClient();

  const [serviceResult, linkResult] = await Promise.all([
    supabase
      .from("services")
      .select(COLUMNS)
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("sort_order")
      .order("name"),
    supabase.from("service_resources").select("service_id, resource_id").eq("tenant_id", tenantId),
  ]);

  if (serviceResult.error) throw new Error(`Hizmetler okunamadı: ${serviceResult.error.message}`);

  const links = new Map<string, string[]>();
  for (const link of linkResult.data ?? []) {
    links.set(link.service_id, [...(links.get(link.service_id) ?? []), link.resource_id]);
  }

  return (serviceResult.data ?? []).map((row) => toService(row, links.get(row.id) ?? []));
}

/** Tek hizmetin düzenleme ekranı. */
export async function loadService(
  tenantId: string,
  serviceId: string,
): Promise<CatalogService | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("services")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", serviceId)
    .maybeSingle();
  if (!data) return null;

  const { data: links } = await supabase
    .from("service_resources")
    .select("resource_id")
    .eq("service_id", serviceId);

  return toService(data, (links ?? []).map((link) => link.resource_id));
}

/** Hizmet formundaki kaynak seçimi — yalnızca aktif kaynaklar. */
export async function loadResourceOptions(
  tenantId: string,
): Promise<{ id: string; name: string; title: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select("id, name, title")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  return data ?? [];
}

/** Hizmet kaç randevuda kullanılmış — silmek yerine pasife almanın gerekçesi. */
export async function countAppointments(serviceId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);
  return count ?? 0;
}
