"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils/phone";

/**
 * Silme taleplerinin işlenmesi.
 *
 * Üç eylem var ve üçü de aynı soruyu cevaplıyor: talep ne oldu?
 *   - elle giriş: telefonla ya da kapıda gelen talep kaydediliyor
 *   - anonimleştir + kapat: imha uygulanıp talep işlenmiş sayılıyor
 *   - kapat: imha uygulanmadan kapatılıyor (kayıt bulunamadı, kimlik
 *     doğrulanamadı, yasal saklama süresi devam ediyor…) — gerekçe zorunlu,
 *     çünkü cevabın kendisi de kayıt altına alınmak zorunda
 *
 * Yetki `customer.erase`: talep satırı kişinin adını ve telefonunu taşıyor ve
 * RLS politikası da aynı izne bakıyor.
 */

const SETTINGS_PATH = "/app/ayarlar/silme-talepleri";

const manualSchema = z.object({
  full_name: z.string().trim().min(2, "Başvuranın adını yazın").max(160),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(254).optional(),
  channel: z.enum(["telefon", "eposta", "kapida"]),
  note: z.string().trim().max(2000).optional(),
});

export async function createErasureRequestAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();

  const parsed = manualSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    channel: formData.get("channel") ?? "telefon",
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) redirect(`${SETTINGS_PATH}?durum=eksik`);
  const input = parsed.data;
  const phone = input.phone ? toE164(input.phone) : null;

  const supabase = await createClient();

  // Telefon eşleşirse talep kayda bağlanıyor: "anonimleştir" düğmesi ancak
  // eşleşen kayıt varken çalışabilir. Eşleşme yoksa satır yine yazılıyor —
  // başvuruyu kaydetmemek, cevap süresini kaybetmek demek.
  let customerId: string | null = null;
  if (phone) {
    const { data: match } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", active.tenant.id)
      .eq("phone", phone)
      .maybeSingle();
    customerId = match?.id ?? null;
  }

  const { error } = await supabase.from("erasure_requests").insert({
    tenant_id: active.tenant.id,
    customer_id: customerId,
    full_name: input.full_name,
    phone,
    email: input.email ?? null,
    note: input.note ?? null,
    channel: input.channel,
  });

  if (error) {
    // Açık talebi olan kişi için ikinci satır açılmıyor (kısmi eşsiz indeks).
    const reason = error.code === "23505" ? "acik_talep" : "hata";
    redirect(`${SETTINGS_PATH}?durum=${reason}`);
  }

  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?durum=kaydedildi`);
}

/**
 * Talebi kapatır. `anonimlestir` işaretliyse önce imhayı uygular.
 *
 * İmha ile kapatma AYNI eylemde: ikisini ayrı düğmelere bölmek, imhayı yapıp
 * talebi açık bırakan (ya da tersi) bir personel hatasını davet ederdi.
 */
export async function resolveErasureRequestAction(formData: FormData): Promise<void> {
  const { active, user } = await requireTenant();

  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) redirect(SETTINGS_PATH);

  const anonymize = formData.get("anonimlestir") === "1";
  const status = anonymize ? "islendi" : String(formData.get("durum") ?? "islendi");
  const resolution = String(formData.get("gerekce") ?? "").trim();

  if (!anonymize && resolution.length < 3) redirect(`${SETTINGS_PATH}?durum=gerekce`);

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("erasure_requests")
    .select("id, customer_id")
    .eq("tenant_id", active.tenant.id)
    .eq("id", id)
    .maybeSingle();

  if (!request) redirect(`${SETTINGS_PATH}?durum=bulunamadi`);

  if (anonymize) {
    if (!request.customer_id) redirect(`${SETTINGS_PATH}?durum=kayit_yok`);

    const { error: eraseError } = await supabase.rpc("anonymize_customer", {
      _tenant_id: active.tenant.id,
      _customer_id: request.customer_id,
    });
    if (eraseError) redirect(`${SETTINGS_PATH}?durum=${eraseError.code === "42501" ? "yetki" : "hata"}`);

    await recordAudit({
      tenantId: active.tenant.id,
      actorId: user.id,
      action: "anonymize",
      entity: "customer",
      entityId: request.customer_id,
      detail: { erasure_request: id },
    });
  }

  const { error } = await supabase
    .from("erasure_requests")
    .update({
      status: status === "reddedildi" ? "reddedildi" : "islendi",
      resolution: resolution || (anonymize ? "Kayıt anonimleştirildi." : null),
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", id);

  if (error) redirect(`${SETTINGS_PATH}?durum=hata`);

  revalidatePath(SETTINGS_PATH);
  if (request.customer_id) revalidatePath(`/app/hastalar/${request.customer_id}`);
  redirect(`${SETTINGS_PATH}?durum=kapatildi`);
}
