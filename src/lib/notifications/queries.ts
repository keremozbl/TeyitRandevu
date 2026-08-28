import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

/**
 * Bildirim merkezinin veri katmanı.
 *
 * Panelin geri kalanı gibi kullanıcının JWT'siyle okur (Kural 4): kuyruk
 * satırlarını `notification.read` izni ve kapsamı süzer — kendi hastalarını
 * gören hekim, başkasının hastasına giden mesajı görmez. Buradaki `eq`
 * çağrıları yalnızca daraltır, yetkiyi vermez.
 */

export type NotificationStatus = Enums<"notification_status">;
export type NotificationChannel = Enums<"notification_channel">;
export type MessageKind = Enums<"message_kind">;
export type FlowTrigger = Enums<"flow_trigger">;

export type OutboxRow = {
  id: string;
  status: NotificationStatus;
  channel: NotificationChannel;
  kind: MessageKind;
  scheduledAt: Date;
  sentAt: Date | null;
  toAddress: string | null;
  customerName: string | null;
  templateName: string | null;
  renderedBody: string | null;
  lastError: string | null;
  provider: string | null;
  attemptCount: number;
  appointmentId: string | null;
  appointmentStartsAt: Date | null;
};

export type OutboxSummary = Record<NotificationStatus, number>;

const EMPTY_SUMMARY: OutboxSummary = {
  scheduled: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  cancelled: 0,
  skipped: 0,
};

export async function loadOutbox({
  tenantId,
  status,
  limit = 100,
}: {
  tenantId: string;
  status?: NotificationStatus;
  limit?: number;
}): Promise<{ rows: OutboxRow[]; summary: OutboxSummary }> {
  const supabase = await createClient();

  let query = supabase
    .from("notifications")
    .select(
      "id, status, channel, kind, scheduled_at, sent_at, to_address, rendered_body, last_error, provider, attempt_count, appointment_id, customers(full_name), message_templates(name), appointments(starts_at)",
    )
    .eq("tenant_id", tenantId)
    .order("scheduled_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  // Özet için ayrı ve dar bir sorgu: filtre değişse de sayılar sabit kalmalı,
  // yoksa "başarısız" sekmesinde bekleyen sayısı sıfır görünürdü.
  const [listResult, summaryResult] = await Promise.all([
    query,
    supabase.from("notifications").select("status").eq("tenant_id", tenantId).limit(1000),
  ]);

  if (listResult.error) throw new Error(`Bildirimler okunamadı: ${listResult.error.message}`);

  const summary = { ...EMPTY_SUMMARY };
  for (const row of summaryResult.data ?? []) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
  }

  const rows: OutboxRow[] = (listResult.data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    channel: row.channel,
    kind: row.kind,
    scheduledAt: new Date(row.scheduled_at),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    toAddress: row.to_address,
    customerName: row.customers?.full_name ?? null,
    templateName: row.message_templates?.name ?? null,
    renderedBody: row.rendered_body,
    lastError: row.last_error,
    provider: row.provider,
    attemptCount: row.attempt_count,
    appointmentId: row.appointment_id,
    appointmentStartsAt: row.appointments?.starts_at ? new Date(row.appointments.starts_at) : null,
  }));

  return { rows, summary };
}

export type TemplateRow = {
  id: string;
  key: string;
  name: string;
  channel: NotificationChannel;
  kind: MessageKind;
  subject: string | null;
  body: string;
  isActive: boolean;
};

export async function loadTemplates(tenantId: string): Promise<TemplateRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("message_templates")
    .select("id, key, name, channel, kind, subject, body, is_active")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) throw new Error(`Şablonlar okunamadı: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    channel: row.channel,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    isActive: row.is_active,
  }));
}

export async function loadTemplate(
  tenantId: string,
  id: string,
): Promise<TemplateRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("message_templates")
    .select("id, key, name, channel, kind, subject, body, is_active")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    key: data.key,
    name: data.name,
    channel: data.channel,
    kind: data.kind,
    subject: data.subject,
    body: data.body,
    isActive: data.is_active,
  };
}

export type FlowRow = {
  id: string;
  name: string;
  trigger: FlowTrigger;
  offsetMinutes: number;
  channel: NotificationChannel;
  isActive: boolean;
  templateId: string;
  templateName: string;
  templateKind: MessageKind;
  templateActive: boolean;
};

export async function loadFlows(tenantId: string): Promise<FlowRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_flows")
    .select(
      "id, name, trigger, offset_minutes, channel, is_active, template_id, message_templates(name, kind, is_active)",
    )
    .eq("tenant_id", tenantId)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Akışlar okunamadı: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    offsetMinutes: row.offset_minutes,
    channel: row.channel,
    isActive: row.is_active,
    templateId: row.template_id,
    templateName: row.message_templates?.name ?? "",
    templateKind: row.message_templates?.kind ?? "service",
    templateActive: row.message_templates?.is_active ?? false,
  }));
}
