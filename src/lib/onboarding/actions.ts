"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TENANT_COOKIE } from "@/lib/auth/session";
import { isDemoUser } from "@/lib/demo/config";
import { seedSampleDay } from "@/lib/demo/sample-day";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getTemplate } from "@/lib/templates";
import { isValidSlug } from "@/lib/utils/slug";

export type OnboardingState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Kurum adı en az 2 karakter olmalı").max(120),
  slug: z
    .string()
    .trim()
    .refine(isValidSlug, "Adres yalnızca küçük harf, rakam ve tire içerebilir"),
  template: z.string().trim().min(1, "Sektör seçin"),
  branch_name: z.string().trim().max(120).optional(),
  starts_at: z.string().regex(/^\d{2}:\d{2}$/, "Başlangıç saati geçersiz"),
  ends_at: z.string().regex(/^\d{2}:\d{2}$/, "Bitiş saati geçersiz"),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "En az bir çalışma günü seçin"),
});

export async function createTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    template: formData.get("template"),
    branch_name: formData.get("branch_name") || undefined,
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    weekdays: formData.getAll("weekdays"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  if (input.ends_at <= input.starts_at) {
    return { error: "Bitiş saati başlangıçtan sonra olmalı" };
  }

  // Şablon SUNUCUDA yüklenir. İstemciden gelen bir yükü olduğu gibi
  // veritabanına yazmıyoruz.
  const template = getTemplate(input.template);
  if (!template) return { error: "Seçilen sektör şablonu bulunamadı" };

  const supabase = await createClient();

  const payload = {
    terminology: template.terminology,
    booking_rules: template.booking_rules,
    branch_name: input.branch_name ?? "Merkez",
    resources: template.resources,
    services: template.services,
    customer_fields: template.customer_fields,
    appointment_fields: template.appointment_fields,
    working_hours: {
      weekdays: input.weekdays,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      // Şablonun öğle arası varsayılanı korunur; kurulumdan sonra düzenlenebilir.
      break: template.working_hours.break,
    },
  };

  const { data, error } = await supabase.rpc("create_tenant_from_template", {
    _name: input.name,
    _slug: input.slug,
    _family: template.family,
    _business_type: template.key,
    _timezone: "Europe/Istanbul",
    // payload yukarıda tam tipli kuruldu; `Json` index signature istediği için
    // yalnızca sınırda dönüştürülüyor. İçerik zaten bir JSON dosyasından geliyor.
    _payload: payload as unknown as Json,
  });

  if (error) {
    if (error.message.includes("tenants_slug_key")) {
      return { error: "Bu adres kullanılıyor. Başka bir adres deneyin." };
    }
    if (error.message.includes("sınırına ulaşıldı")) {
      return { error: "Bu hesapla en fazla 5 kurum açabilirsiniz." };
    }
    return { error: `Kurum oluşturulamadı: ${error.message}` };
  }

  if (data) {
    // Demo hesabıysa takvim boş açılmasın: kurulumun hemen ardından gerçekçi
    // bir gün yazılır. Karar istemciden gelen bir bayrağa değil, hesabın
    // `app_metadata` işaretine bakıyor — kimse kendi kurumuna örnek veri
    // yazdırmak için form alanı uydurmasın.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (isDemoUser(user)) {
      await seedSampleDay(supabase, { tenantId: data, timeZone: "Europe/Istanbul" });
    }

    (await cookies()).set(TENANT_COOKIE, data, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Panele doğrudan atmıyoruz: kurum az önce seçtiği randevu adresini bir
  // kez daha, paylaşılabilir hâlde görmeli. Ürünün tek dış çıktısı o
  // bağlantı; paylaşılmazsa internetten randevu gelmiyor.
  redirect("/kurulum/hazir");
}
