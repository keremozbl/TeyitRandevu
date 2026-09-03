"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { ACCENTS, parseBranding } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

/**
 * Randevu sayfasının görünüşü: logo, aksan rengi, fiyat görünürlüğü, tanıtım.
 *
 * Logo `kurum-gorsel` kovasına, `<tenant_id>/…` yoluna yükleniyor; yazma
 * yetkisini Storage politikası veriyor (`96_storage.sql`), yani buradaki
 * kontrol kolaylık, kapı değil.
 *
 * Dosya adına zaman damgası konuyor: aynı ada yazmak CDN'de eski logonun
 * takılı kalmasına yol açıyor. Yeni dosya yazıldıktan SONRA eskisi siliniyor —
 * ters sırada bir hata, kurumu logosuz bırakırdı.
 *
 * Silinen dosya CDN'de bir süre daha yanıt vermeye devam eder (bir yıllık
 * `cacheControl` ile yüklüyoruz ve public kova CDN'in arkasında). Sayfadaki
 * referans gittiği için bu bir sorun değil; logo gizli bir veri değil. Gizli
 * bir dosya türü eklenecekse (belge, rapor) o AYRI ve public OLMAYAN bir
 * kovaya gitmeli.
 */

export type BrandingFormState = { error?: string; ok?: boolean };

const MAX_BYTES = 512 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const schema = z.object({
  accent: z.string().refine((value) => ACCENTS.some((accent) => accent.value === value), {
    message: "Renk listeden seçilmeli",
  }),
  show_prices: z.boolean(),
  about: z.string().trim().max(400, "Tanıtım en fazla 400 karakter"),
});

export async function updateBrandingAction(
  _prev: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const { active } = await requireTenant();
  const supabase = await createClient();

  const parsed = schema.safeParse({
    accent: String(formData.get("accent") ?? ""),
    show_prices: formData.get("show_prices") === "on",
    about: String(formData.get("about") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: row, error: readError } = await supabase
    .from("tenant_settings")
    .select("branding")
    .eq("tenant_id", active.tenant.id)
    .maybeSingle();

  if (readError) return { error: `Ayarlar okunamadı: ${readError.message}` };

  const current = parseBranding(row?.branding);
  let logoPath = current.logo_path;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const extension = TYPES[file.type];
    if (!extension) return { error: "Logo PNG, JPEG ya da WebP olmalı." };
    if (file.size > MAX_BYTES) return { error: "Logo 512 KB'tan küçük olmalı." };

    const path = `${active.tenant.id}/logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("kurum-gorsel")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });

    if (uploadError) return { error: `Logo yüklenemedi: ${uploadError.message}` };

    const previous = current.logo_path;
    logoPath = path;
    if (previous && previous !== path) {
      await supabase.storage.from("kurum-gorsel").remove([previous]);
    }
  }

  if (formData.get("logo_sil") === "1" && logoPath) {
    await supabase.storage.from("kurum-gorsel").remove([logoPath]);
    logoPath = null;
  }

  const branding = {
    ...current,
    logo_path: logoPath,
    accent: parsed.data.accent,
    show_prices: parsed.data.show_prices,
    about: parsed.data.about,
  };

  const { error: writeError } = await supabase
    .from("tenant_settings")
    .update({ branding })
    .eq("tenant_id", active.tenant.id);

  if (writeError) {
    // RLS reddi de buraya düşer: yetkisi olmayan kullanıcı için satır
    // güncellenmez ve mesaj anlaşılır olmalı.
    return { error: `Kaydedilemedi: ${writeError.message}` };
  }

  revalidatePath("/app/ayarlar");
  revalidatePath(`/r/${active.tenant.slug}`);
  return { ok: true };
}
