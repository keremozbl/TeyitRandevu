"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { parseMoney } from "./pricing";

export type ServiceFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "duration_min" | "price" | "color", string>>;
};

const schema = z.object({
  name: z.string().trim().min(1, "Hizmet adı gerekli").max(160),
  category: z.string().trim().max(80),
  duration_min: z.coerce.number().int().min(5, "Süre en az 5 dakika").max(1440),
  buffer_before_min: z.coerce.number().int().min(0).max(240).catch(0),
  buffer_after_min: z.coerce.number().int().min(0).max(240).catch(0),
  vat_rate: z.coerce.number().min(0).max(100).catch(20),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/, "Renk #1A2B3C biçiminde olmalı"), z.literal("")]),
  is_online_bookable: z.string().optional(),
  is_active: z.string().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).catch(0),
});

function readForm(formData: FormData) {
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    category: formData.get("category") ?? "",
    duration_min: formData.get("duration_min") ?? "",
    buffer_before_min: formData.get("buffer_before_min") ?? 0,
    buffer_after_min: formData.get("buffer_after_min") ?? 0,
    vat_rate: formData.get("vat_rate") ?? 20,
    color: formData.get("color") ?? "",
    is_online_bookable: formData.get("is_online_bookable") ?? undefined,
    is_active: formData.get("is_active") ?? undefined,
    sort_order: formData.get("sort_order") ?? 0,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = String(issue.path[0] ?? "name");
    const field = path === "duration_min" || path === "color" ? path : "name";
    return { error: { error: issue.message, fieldErrors: { [field]: issue.message } } as ServiceFormState };
  }

  // Fiyat serbest metin: boş bırakmak "fiyat yok" demek, sıfır demek değil
  const rawPrice = String(formData.get("price") ?? "").trim();
  let price: number | null = null;
  if (rawPrice) {
    price = parseMoney(rawPrice);
    if (price === null) {
      return {
        error: {
          error: "Fiyat okunamadı.",
          fieldErrors: { price: "Örnek: 1.250,00 — boş bırakılabilir" },
        } as ServiceFormState,
      };
    }
  }

  const resourceIds = formData
    .getAll("kaynak")
    .map(String)
    .filter((id) => z.uuid().safeParse(id).success);

  return {
    values: {
      name: parsed.data.name,
      category: parsed.data.category || null,
      duration_min: parsed.data.duration_min,
      buffer_before_min: parsed.data.buffer_before_min,
      buffer_after_min: parsed.data.buffer_after_min,
      price,
      vat_rate: parsed.data.vat_rate,
      color: parsed.data.color || null,
      is_online_bookable: parsed.data.is_online_bookable === "on",
      is_active: parsed.data.is_active === "on",
      sort_order: parsed.data.sort_order,
      resourceIds,
    },
  };
}

/**
 * Hizmeti verebilen kaynakları yeniden yazar.
 *
 * Hiç kaynak seçilmemesi kısıt yok demektir; tablo o zaman boş kalır. Sil-yaz
 * yapılıyor çünkü liste tamamen formdan geliyor ve bu satırlara kimse
 * referans vermiyor.
 */
async function writeResourceLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  serviceId: string,
  resourceIds: string[],
): Promise<string | null> {
  const { error: deleteError } = await supabase
    .from("service_resources")
    .delete()
    .eq("service_id", serviceId);
  if (deleteError) return `Kaynak eşlemesi güncellenemedi: ${deleteError.message}`;

  if (resourceIds.length === 0) return null;

  const { error } = await supabase.from("service_resources").insert(
    resourceIds.map((resourceId) => ({
      tenant_id: tenantId,
      service_id: serviceId,
      resource_id: resourceId,
    })),
  );
  return error ? `Kaynak eşlemesi yazılamadı: ${error.message}` : null;
}

export async function createServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { active } = await requireTenant();

  const read = readForm(formData);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      tenant_id: active.tenant.id,
      name: values.name,
      category: values.category,
      duration_min: values.duration_min,
      buffer_before_min: values.buffer_before_min,
      buffer_after_min: values.buffer_after_min,
      price: values.price,
      vat_rate: values.vat_rate,
      color: values.color,
      is_online_bookable: values.is_online_bookable,
      is_active: values.is_active,
      sort_order: values.sort_order,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { error: "Hizmet ekleme yetkiniz yok. Bu işlem `service.manage` izni ister." };
    }
    return { error: `Hizmet eklenemedi: ${error.message}` };
  }

  const linkError = await writeResourceLinks(supabase, active.tenant.id, data.id, values.resourceIds);
  if (linkError) return { error: linkError };

  revalidatePath("/app/hizmetler");
  revalidatePath("/app");
  redirect(`/app/hizmetler?vurgu=${data.id}`);
}

export async function updateServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { active } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "Hizmet bulunamadı." };

  const read = readForm(formData);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({
      name: values.name,
      category: values.category,
      duration_min: values.duration_min,
      buffer_before_min: values.buffer_before_min,
      buffer_after_min: values.buffer_after_min,
      price: values.price,
      vat_rate: values.vat_rate,
      color: values.color,
      is_online_bookable: values.is_online_bookable,
      is_active: values.is_active,
      sort_order: values.sort_order,
    })
    .eq("tenant_id", active.tenant.id)
    .eq("id", id);

  if (error) {
    if (error.code === "42501") return { error: "Bu hizmeti değiştirme yetkiniz yok." };
    return { error: `Hizmet güncellenemedi: ${error.message}` };
  }

  const linkError = await writeResourceLinks(supabase, active.tenant.id, id, values.resourceIds);
  if (linkError) return { error: linkError };

  revalidatePath("/app/hizmetler");
  revalidatePath("/app");
  redirect(`/app/hizmetler?vurgu=${id}&kaydedildi=1`);
}

const toggleSchema = z.object({ id: z.uuid(), active: z.enum(["0", "1"]) });

/**
 * Hizmeti pasife alır ya da geri açar.
 *
 * Silme sunulmuyor: `appointments.service_id` silinen hizmette null'a düşer,
 * yani geçmiş randevu "hangi tedaviydi" bilgisini kaybeder. Pasif hizmet yeni
 * randevuda seçilemez, geçmişte kalır.
 */
export async function toggleServiceAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();

  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active"),
  });
  if (!parsed.success) redirect("/app/hizmetler?hata=Geçersiz+istek");

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ is_active: parsed.data.active === "1" })
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id);

  revalidatePath("/app/hizmetler");
  revalidatePath("/app");
  redirect(
    error
      ? `/app/hizmetler?hata=${encodeURIComponent(`Değiştirilemedi: ${error.message}`)}`
      : `/app/hizmetler?vurgu=${parsed.data.id}`,
  );
}
