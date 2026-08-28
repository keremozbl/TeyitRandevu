"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { bookingRulesSchema } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

import { isValidTimeZone } from "./timezone";

export type SettingsFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "timezone" | "slot_step_minutes", string>>;
};

const schema = z.object({
  name: z.string().trim().min(2, "Kurum adı en az 2 karakter olmalı").max(160),
  timezone: z.string().trim().min(1, "Zaman dilimi seçin").max(64),
  min_lead_minutes: z.coerce.number().int().min(0).max(43_200),
  max_advance_days: z.coerce.number().int().min(1).max(365),
  cancel_window_minutes: z.coerce.number().int().min(0).max(43_200),
  hold_minutes: z.coerce.number().int().min(1).max(60),
  slot_step_minutes: z.coerce.number().int().min(5).max(240),
});

/**
 * Kurum ayarları: ad, zaman dilimi ve randevu kuralları.
 *
 * İki tablo, iki ayrı izin: `tenants` için `tenant.manage`, `tenant_settings`
 * için `settings.manage`. Biri reddedilirse diğerinin yazdığı kalır — ayrı
 * kayıtlar, ayrı anlamlar; ikisini tek işleme sokmak için RPC yazmak gereksiz
 * bir bağ kurardı.
 */
export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { active } = await requireTenant();

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    timezone: formData.get("timezone") ?? "",
    min_lead_minutes: formData.get("min_lead_minutes") ?? 0,
    max_advance_days: formData.get("max_advance_days") ?? 60,
    cancel_window_minutes: formData.get("cancel_window_minutes") ?? 0,
    hold_minutes: formData.get("hold_minutes") ?? 10,
    slot_step_minutes: formData.get("slot_step_minutes") ?? 15,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = String(issue.path[0] ?? "");
    const field = path === "name" || path === "timezone" || path === "slot_step_minutes" ? path : "name";
    return { error: issue.message, fieldErrors: { [field]: issue.message } };
  }
  const input = parsed.data;

  if (!isValidTimeZone(input.timezone)) {
    return {
      error: "Zaman dilimi tanınmadı.",
      fieldErrors: { timezone: "Örnek: Europe/Istanbul" },
    };
  }

  // Kurallar veritabanına yazılmadan önce kendi şemasından geçer: jsonb
  // şemasız, bozuk bir anahtar randevu sayfasını sonradan bozardı.
  const rules = bookingRulesSchema.parse({
    min_lead_minutes: input.min_lead_minutes,
    max_advance_days: input.max_advance_days,
    cancel_window_minutes: input.cancel_window_minutes,
    hold_minutes: input.hold_minutes,
    slot_step_minutes: input.slot_step_minutes,
  });

  const supabase = await createClient();

  const { error: tenantError } = await supabase
    .from("tenants")
    .update({ name: input.name, timezone: input.timezone })
    .eq("id", active.tenant.id);
  if (tenantError) {
    if (tenantError.code === "42501") {
      return { error: "Kurum bilgilerini değiştirme yetkiniz yok (`tenant.manage`)." };
    }
    return { error: `Kurum güncellenemedi: ${tenantError.message}` };
  }

  // Ayar satırı onboarding'de açılıyor ama garanti değil: upsert.
  const { error: settingsError } = await supabase
    .from("tenant_settings")
    .upsert({ tenant_id: active.tenant.id, booking_rules: rules }, { onConflict: "tenant_id" });
  if (settingsError) {
    if (settingsError.code === "42501") {
      return { error: "Randevu kurallarını değiştirme yetkiniz yok (`settings.manage`)." };
    }
    return { error: `Kurallar güncellenemedi: ${settingsError.message}` };
  }

  revalidatePath("/app/ayarlar");
  revalidatePath("/app");
  redirect("/app/ayarlar?kaydedildi=1");
}
