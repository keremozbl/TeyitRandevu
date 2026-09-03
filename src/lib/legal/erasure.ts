import { createClient } from "@/lib/supabase/server";

/**
 * Silme talepleri (KVKK m.11 başvurusu, m.13 cevap süresi).
 *
 * Talep hangi kanaldan gelirse gelsin buraya yazılıyor: randevu sayfasından
 * gelen kendi düşüyor, telefonla gelen personel tarafından giriliyor. Kayıt
 * tutmanın sebebi imhanın kendisi değil — o zaten yapılabiliyordu — denetimde
 * sorulan soru: talep ne zaman geldi ve ne zaman cevaplandı?
 */

export type ErasureStatus = "yeni" | "islendi" | "reddedildi";

export type ErasureRequest = {
  id: string;
  customerId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  channel: string;
  status: ErasureStatus;
  createdAt: Date;
  dueAt: Date;
  resolution: string | null;
  resolvedAt: Date | null;
  /** Eşleşen kayıt zaten anonimleştirildiyse dolu */
  customerAnonymizedAt: Date | null;
};

export const CHANNEL_LABELS: Record<string, string> = {
  randevu_sayfasi: "randevu sayfası",
  telefon: "telefon",
  eposta: "e-posta",
  kapida: "kapıda",
};

export const STATUS_LABELS: Record<ErasureStatus, string> = {
  yeni: "Bekliyor",
  islendi: "İşlendi",
  reddedildi: "Reddedildi",
};

/** Cevaba kaç gün kaldı; eksi değer süreyi aştığımızı gösterir. */
export function daysLeft(dueAt: Date, now = new Date()): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);
}

export async function loadErasureRequests({
  tenantId,
  onlyOpen,
}: {
  tenantId: string;
  onlyOpen: boolean;
}): Promise<ErasureRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from("erasure_requests")
    .select(
      "id, customer_id, full_name, phone, email, note, channel, status, created_at, due_at, resolution, resolved_at, customers(anonymized_at)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (onlyOpen) query = query.eq("status", "yeni");

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    note: row.note,
    channel: row.channel,
    status: row.status as ErasureStatus,
    createdAt: new Date(row.created_at),
    dueAt: new Date(row.due_at),
    resolution: row.resolution,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    customerAnonymizedAt: row.customers?.anonymized_at
      ? new Date(row.customers.anonymized_at)
      : null,
  }));
}

/** Bekleyen talep sayısı — ayarlar ekranındaki rozet. */
export async function countOpenErasureRequests(tenantId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("erasure_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "yeni");

  return count ?? 0;
}
