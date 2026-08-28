import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

import { providerFor } from "./providers";
import { buildVariables, renderTemplate, type NotificationPayload } from "./render";

/**
 * Kuyruğu boşaltan işçi.
 *
 * Servis rolüyle çalışır (Kural 5: anahtar sunucuda kalır). Bu meşru: kuyruk
 * bir kullanıcının değil sistemin işidir ve `claim_notifications` yalnızca
 * `service_role`a açıktır. Yetki kontrolü kuyruğa YAZARKEN yapıldı; buradaki
 * iş, yazılmış olanı göndermek.
 *
 * Aynı anda iki işçi çalışsa bile aynı mesaj iki kez gitmez: satırları
 * `for update skip locked` ile alıyoruz (80_notifications).
 *
 * Başarısızlık randevuyu bozmaz — outbox deseninin bütün amacı bu. Hata
 * satıra yazılır, üç denemeden sonra `failed` olur ve panelde görünür.
 */

const MAX_ATTEMPTS = 3;

/** Deneme başına artan bekleme: geçici sağlayıcı hatası hemen tekrarlanmasın. */
function retryDelayMinutes(attempt: number): number {
  return attempt * 5;
}

export type DispatchReport = {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
};

type NotificationRow = Tables<"notifications">;

export async function dispatchNotifications({
  limit = 20,
  siteUrl,
}: {
  limit?: number;
  siteUrl?: string;
} = {}): Promise<DispatchReport> {
  const supabase = createAdminClient();
  const report: DispatchReport = { claimed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };

  const { data: claimed, error } = await supabase.rpc("claim_notifications", { _limit: limit });
  if (error) throw new Error(`Kuyruk okunamadı: ${error.message}`);

  const rows = (claimed ?? []) as NotificationRow[];
  report.claimed = rows.length;
  if (rows.length === 0) return report;

  // Şablon metinleri tek turda: satır başına sorgu atmak, Frankfurt'a kadar
  // yirmi gidiş dönüş demek (CANLIYA-GECIS B8).
  const templateIds = [...new Set(rows.map((row) => row.template_id).filter(Boolean))] as string[];
  const { data: templates } = await supabase
    .from("message_templates")
    .select("id, body, subject, is_active")
    .in("id", templateIds);

  const byId = new Map((templates ?? []).map((template) => [template.id, template]));

  for (const row of rows) {
    const template = row.template_id ? byId.get(row.template_id) : undefined;

    if (!template || !template.is_active) {
      await supabase
        .from("notifications")
        .update({ status: "skipped", last_error: "Şablon bulunamadı ya da pasif" })
        .eq("id", row.id);
      report.skipped += 1;
      continue;
    }

    const variables = buildVariables((row.payload ?? {}) as NotificationPayload, { siteUrl });
    const rendered = renderTemplate(template.body, variables);
    const subject = template.subject
      ? renderTemplate(template.subject, variables).text
      : null;

    if (!row.to_address || rendered.text.length === 0) {
      await supabase
        .from("notifications")
        .update({
          status: "skipped",
          rendered_body: rendered.text,
          last_error: row.to_address ? "Mesaj metni boş" : "Alıcı adresi yok",
        })
        .eq("id", row.id);
      report.skipped += 1;
      continue;
    }

    const provider = providerFor(row.channel);

    try {
      const result = await provider.send({
        channel: row.channel,
        to: row.to_address,
        subject,
        body: rendered.text,
      });

      await supabase
        .from("notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          rendered_body: rendered.text,
          rendered_subject: subject,
          provider: provider.name,
          provider_ref: result.ref,
          cost: result.cost,
          last_error: null,
        })
        .eq("id", row.id);
      report.sent += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const willRetry = row.attempt_count < MAX_ATTEMPTS;

      await supabase
        .from("notifications")
        .update({
          status: willRetry ? "scheduled" : "failed",
          scheduled_at: willRetry
            ? new Date(Date.now() + retryDelayMinutes(row.attempt_count) * 60_000).toISOString()
            : row.scheduled_at,
          rendered_body: rendered.text,
          rendered_subject: subject,
          provider: provider.name,
          last_error: message.slice(0, 500),
        })
        .eq("id", row.id);

      if (willRetry) report.retried += 1;
      else report.failed += 1;
    }
  }

  return report;
}
