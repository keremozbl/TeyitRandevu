/**
 * Denetim kaydı ekranının veri katmanı.
 *
 * Kayıtlar kullanıcının JWT'siyle okunur: `audit_logs` üzerindeki tek politika
 * `audit.read` iznini arıyor (90_rls). İzni olmayan kullanıcı bu sorguyu atsa
 * bile boş liste alır — ekrandaki kontrol yalnızca ona "yetkin yok" diyebilmek
 * için.
 *
 * Tarih penceresi ZORUNLU ve varsayılanı dar: tablo ay bazlı bölümlenmiş
 * (50_appointments) ve `at` üzerinde sınır olmayan bir sorgu bütün bölümleri
 * tarar. Pencere daraldıkça planlayıcı bölümleri eler.
 */

import { recordAudit } from "@/lib/audit/log";
import { resolveEmails } from "@/lib/auth/emails";
import { createClient } from "@/lib/supabase/server";

import type { AuditAction, AuditEntity } from "./log";

export type AuditRow = {
  id: string;
  at: Date;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  /** Denetim kaydının hedefi bir hastaysa adı; okuma yetkisi yoksa null */
  targetName: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
};

export const AUDIT_PAGE_SIZE = 200;

/** Ekrandaki gün seçenekleri; hepsi bir bölüm sınırının içinde kalacak kadar dar. */
export const AUDIT_WINDOWS = [7, 30, 90] as const;
export type AuditWindow = (typeof AUDIT_WINDOWS)[number];

export function parseWindow(value: string | undefined): AuditWindow {
  const days = Number(value);
  return (AUDIT_WINDOWS as readonly number[]).includes(days) ? (days as AuditWindow) : 7;
}

export async function loadAuditTrail({
  tenantId,
  days,
  entity,
}: {
  tenantId: string;
  days: AuditWindow;
  entity?: AuditEntity;
}): Promise<AuditRow[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let query = supabase
    .from("audit_logs")
    .select("id, at, actor_id, action, entity, entity_id, diff, ip")
    .eq("tenant_id", tenantId)
    .gte("at", since.toISOString())
    .order("at", { ascending: false })
    .limit(AUDIT_PAGE_SIZE);

  if (entity) query = query.eq("entity", entity);

  const { data } = await query;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Hasta adları AYRI ve kullanıcının kendi yetkisiyle okunuyor: denetim
  // ekranı, hasta listesini görmenin arka kapısı olmamalı. Yetki yoksa satır
  // kimlikle çizilir.
  const customerIds = [
    ...new Set(
      rows
        .filter((row) => row.entity === "customer" || row.entity === "customer_medical_note")
        .map((row) => row.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [emails, names] = await Promise.all([
    resolveEmails(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
    loadCustomerNames(supabase, tenantId, customerIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    at: new Date(row.at),
    actorId: row.actor_id,
    actorEmail: row.actor_id ? (emails.get(row.actor_id) ?? null) : null,
    action: row.action as AuditAction,
    entity: row.entity as AuditEntity,
    entityId: row.entity_id,
    targetName: row.entity_id ? (names.get(row.entity_id) ?? null) : null,
    detail: (row.diff ?? null) as Record<string, unknown> | null,
    ip: row.ip as string | null,
  }));
}

async function loadCustomerNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (ids.length === 0) return found;

  const { data } = await supabase
    .from("customers")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  for (const row of data ?? []) found.set(row.id, row.full_name);
  return found;
}

/**
 * Denetim listesinin görüntülenmesi de denetim kaydıdır.
 *
 * "Kimin neye baktığını kim izledi" sorusunun cevabı olmazsa, izleme
 * ekranının kendisi kayıtsız bir pencere olurdu.
 */
export async function recordAuditView(tenantId: string, actorId: string, days: number) {
  await recordAudit({
    tenantId,
    actorId,
    action: "read",
    entity: "report",
    detail: { report: "denetim", days },
  });
}
