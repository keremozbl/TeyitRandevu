"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Bildirim merkezinin yazma yolu.
 *
 * Yetki RLS'te (Kural 3): şablonu ve akışı yalnız `notification.template.manage`
 * izni olan değiştirebilir, kuyruk satırını yalnız o iptal edip yeniden
 * deneyebilir. Buradaki kontroller hata mesajını insanlaştırmak için.
 *
 * Kuyruğa ELLE mesaj yazan bir eylem YOK ve bilerek yok: `notifications`
 * tablosunda INSERT politikası bulunmuyor. Elle mesaj, hizmet/ticari ayrımını
 * (CLAUDE.md kural 7) atlamanın yolu olurdu.
 */

const templateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Şablon adı en az iki karakter").max(120),
  subject: z.string().trim().max(160),
  body: z.string().trim().min(2, "Mesaj metni boş olamaz").max(1600),
  kind: z.enum(["service", "commercial"]),
  is_active: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type TemplateFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "body", string>>;
};

export async function updateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const { active } = await requireTenant();

  const parsed = templateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? "",
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
    kind: formData.get("kind") ?? "service",
    is_active: formData.get("is_active") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return {
      error: issue.message,
      fieldErrors: field === "name" || field === "body" ? { [field]: issue.message } : undefined,
    };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { error, data } = await supabase
    .from("message_templates")
    .update({
      name: input.name,
      subject: input.subject || null,
      body: input.body,
      kind: input.kind,
      is_active: input.is_active === "on",
    })
    .eq("tenant_id", active.tenant.id)
    .eq("id", input.id)
    .select("id");

  if (error) return { error: `Şablon kaydedilemedi: ${error.message}` };
  if (!data || data.length === 0) {
    // RLS 0 satır döndürdü: yetki yok ya da şablon başka kuruma ait.
    return { error: "Bu şablonu değiştirme yetkiniz yok." };
  }

  revalidatePath("/app/bildirimler");
  redirect("/app/bildirimler/sablonlar?kaydedildi=1");
}

const flowSchema = z.object({ id: z.uuid(), is_active: z.enum(["true", "false"]) });

/** Akışı aç/kapat. Kapalı akış yeni mesaj kuyruğa yazmaz. */
export async function toggleFlowAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();

  const parsed = flowSchema.safeParse({
    id: formData.get("id"),
    is_active: formData.get("is_active"),
  });
  if (!parsed.success) redirect("/app/bildirimler?hata=Akış bulunamadı");

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_flows")
    .update({ is_active: parsed.data.is_active === "true" })
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id);

  if (error) redirect("/app/bildirimler?hata=Akış güncellenemedi");

  revalidatePath("/app/bildirimler");
  redirect("/app/bildirimler");
}

const rowSchema = z.object({ id: z.uuid(), durum: z.string().optional() });

/**
 * Bekleyen mesajı iptal eder. Gönderilmiş mesaj geri alınamaz — o yüzden
 * yalnız `scheduled` satırlar hedefleniyor.
 */
export async function cancelNotificationAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();
  const parsed = rowSchema.safeParse({
    id: formData.get("id"),
    durum: formData.get("durum") ?? undefined,
  });
  if (!parsed.success) redirect("/app/bildirimler");

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ status: "cancelled", last_error: "Panelden iptal edildi" })
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id)
    .eq("status", "scheduled");

  revalidatePath("/app/bildirimler");
  redirect(parsed.data.durum ? `/app/bildirimler?durum=${parsed.data.durum}` : "/app/bildirimler");
}

/**
 * BAŞARISIZ mesajı yeniden kuyruğa alır.
 *
 * Yalnız `failed`: "gönderilmedi" (skipped) bir hata değil bir karardır —
 * ticari ileti onayı yok ya da hastanın numarası yok. Onu yeniden kuyruğa
 * atmak işe yaramazdı; `claim_notifications` İYS kapısını ve boş adresi
 * yeniden kontrol edip satırı almazdı ve kuyrukta sonsuza kadar "bekliyor"
 * görünürdü. Çözüm yeniden denemek değil, onayı ya da numarayı almak.
 *
 * `attempt_count` SIFIRLANMAZ: kaç kez denendiği kaydın parçası.
 */
export async function retryNotificationAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();
  const parsed = rowSchema.safeParse({
    id: formData.get("id"),
    durum: formData.get("durum") ?? undefined,
  });
  if (!parsed.success) redirect("/app/bildirimler");

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({
      status: "scheduled",
      scheduled_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id)
    .eq("status", "failed");

  revalidatePath("/app/bildirimler");
  redirect(parsed.data.durum ? `/app/bildirimler?durum=${parsed.data.durum}` : "/app/bildirimler");
}
