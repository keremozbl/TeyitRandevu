"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { loadPermissions, MEDICAL_READ } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils/phone";

import { customDataFrom, visibleFields, type FieldValue } from "./fields";
import { findByPhone, loadCustomerFields } from "./queries";

export type CustomerFormState = {
  error?: string;
  /** Kaydı engellemeyen ama görülmesi gereken durum: aynı numara başkasında var */
  warning?: string;
  fieldErrors?: Partial<Record<"full_name" | "phone" | "email" | "birth_date", string>>;
};

const schema = z.object({
  full_name: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı").max(160),
  phone: z.string().trim().max(32),
  email: z.string().trim().max(160),
  birth_date: z.string().trim(),
  notes: z.string().trim().max(4000),
  tags: z.string().trim().max(400),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Etiketler virgülle yazılır; tekrarlar ve boşluklar burada temizlenir. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const tag of raw.split(",")) {
    const clean = tag.trim().slice(0, 40);
    if (clean) seen.add(clean);
  }
  return [...seen].slice(0, 20);
}

/** Formun ortak okuması: ad, iletişim, etiket ve kurumun esnek alanları. */
async function readForm(formData: FormData, tenantId: string) {
  const parsed = schema.safeParse({
    full_name: formData.get("full_name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    birth_date: formData.get("birth_date") ?? "",
    notes: formData.get("notes") ?? "",
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: { error: issue.message, fieldErrors: { full_name: issue.message } } as CustomerFormState };
  }
  const input = parsed.data;

  let phone: string | null = null;
  if (input.phone) {
    phone = toE164(input.phone);
    if (!phone) {
      return {
        error: {
          error: "Telefon numarası okunamadı.",
          fieldErrors: { phone: "Örnek: 0555 123 45 67" },
        } as CustomerFormState,
      };
    }
  }

  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return {
      error: {
        error: "E-posta adresi geçersiz.",
        fieldErrors: { email: "ornek@klinik.com" },
      } as CustomerFormState,
    };
  }

  if (input.birth_date && !DATE_RE.test(input.birth_date)) {
    return {
      error: {
        error: "Doğum tarihi geçersiz.",
        fieldErrors: { birth_date: "Gün/ay/yıl seçin" },
      } as CustomerFormState,
    };
  }

  // Tıbbi alan yazma yetkisi olmayan kullanıcının gönderdiği tıbbi değerler
  // sessizce yok sayılır: form onları göstermiyor, gönderilmişse de yazılmaz.
  const permissions = await loadPermissions();
  const definitions = visibleFields(await loadCustomerFields(tenantId), permissions.can(MEDICAL_READ));
  const customData = customDataFrom(definitions, (key) => {
    const values = formData.getAll(`alan_${key}`);
    if (values.length === 0) return null;
    if (values.length > 1) return values.map(String);
    return String(values[0]);
  });

  // Şube seçimi tek şubeli kurumda gizli alandan, zincirde seçiciden gelir
  const branchRaw = String(formData.get("branch_id") ?? "");
  const branchId = z.uuid().safeParse(branchRaw).success ? branchRaw : null;

  return {
    values: {
      branch_id: branchId,
      full_name: input.full_name,
      phone,
      email: input.email || null,
      birth_date: input.birth_date || null,
      notes: input.notes || null,
      tags: parseTags(input.tags),
      customData,
    },
  };
}

/**
 * Yeni hasta kaydı.
 *
 * Telefon tekilliği veritabanında zorlanmıyor — aynı numarayı paylaşan aile
 * üyeleri gerçek bir durum. Ama aynı hastanın ikinci kez açılması da gerçek;
 * o yüzden kayıt açılır ve kart üzerinde uyarı gösterilir.
 */
export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { active } = await requireTenant();

  const read = await readForm(formData, active.tenant.id);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();

  const twin = values.phone ? await findByPhone(active.tenant.id, values.phone) : null;

  const { data, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: active.tenant.id,
      branch_id: values.branch_id,
      full_name: values.full_name,
      phone: values.phone,
      email: values.email,
      birth_date: values.birth_date,
      notes: values.notes,
      tags: values.tags,
      custom_data: values.customData,
      source: "panel",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") return { error: "Hasta kaydı açma yetkiniz yok." };
    if (error.code === "23514" || error.code === "22P02") {
      return { error: "Girilen bir değer kuralı bozuyor: telefon ve doğum tarihini kontrol edin." };
    }
    return { error: `Hasta kaydedilemedi: ${error.message}` };
  }

  revalidatePath("/app/hastalar");
  const params = new URLSearchParams();
  if (twin) params.set("ikiz", twin.id);
  redirect(`/app/hastalar/${data.id}${params.size > 0 ? `?${params}` : ""}`);
}

/** Hasta kartındaki bilgileri günceller. */
export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { active } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "Hasta bulunamadı." };

  const read = await readForm(formData, active.tenant.id);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();

  // Görünmeyen tıbbi alanların değerleri korunur: yetkisi olmayan biri kaydı
  // güncellediğinde göremediği veriyi silmiş olmamalı.
  const { data: current } = await supabase
    .from("customers")
    .select("custom_data")
    .eq("tenant_id", active.tenant.id)
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "Hasta bulunamadı ya da erişiminiz yok." };

  const permissions = await loadPermissions();
  const definitions = await loadCustomerFields(active.tenant.id);
  const hidden = permissions.can(MEDICAL_READ) ? [] : definitions.filter((f) => f.isMedical);
  const previous = (current.custom_data ?? {}) as Record<string, FieldValue>;
  const merged: Record<string, FieldValue> = { ...values.customData };
  for (const field of hidden) {
    if (field.key in previous) merged[field.key] = previous[field.key];
  }

  const { error } = await supabase
    .from("customers")
    .update({
      ...(values.branch_id ? { branch_id: values.branch_id } : {}),
      full_name: values.full_name,
      phone: values.phone,
      email: values.email,
      birth_date: values.birth_date,
      notes: values.notes,
      tags: values.tags,
      custom_data: merged,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "42501") return { error: "Bu hastayı değiştirme yetkiniz yok." };
    if (error.code === "23514" || error.code === "22P02") {
      return { error: "Girilen bir değer kuralı bozuyor: telefon ve doğum tarihini kontrol edin." };
    }
    return { error: `Hasta güncellenemedi: ${error.message}` };
  }

  revalidatePath("/app/hastalar");
  revalidatePath(`/app/hastalar/${id}`);
  redirect(`/app/hastalar/${id}?kaydedildi=1`);
}

const noteSchema = z.object({
  customer_id: z.uuid(),
  body: z.string().trim().min(1, "Not boş olamaz").max(8000),
  resource_id: z.union([z.uuid(), z.literal("")]),
});

/**
 * Tıbbi not ekler.
 *
 * Yetkiyi RLS verir (Kural 8): yazma izni olmayan kullanıcının insert'ü
 * `42501` ile döner. Buradaki kontrol yalnızca hata cümlesini anlaşılır
 * kılmak için.
 */
export async function addMedicalNoteAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { active, user } = await requireTenant();

  const parsed = noteSchema.safeParse({
    customer_id: formData.get("customer_id"),
    body: formData.get("body") ?? "",
    resource_id: formData.get("resource_id") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("branch_id")
    .eq("tenant_id", active.tenant.id)
    .eq("id", input.customer_id)
    .maybeSingle();
  if (!customer) return { error: "Hasta bulunamadı ya da erişiminiz yok." };

  const { error } = await supabase.from("customer_medical_notes").insert({
    tenant_id: active.tenant.id,
    customer_id: input.customer_id,
    branch_id: customer.branch_id,
    resource_id: input.resource_id || null,
    body: input.body,
    author_id: user.id,
  });

  if (error) {
    if (error.code === "42501") {
      return { error: "Tıbbi not yazma yetkiniz yok. Bu izin rol bazında verilir." };
    }
    return { error: `Not kaydedilemedi: ${error.message}` };
  }

  revalidatePath(`/app/hastalar/${input.customer_id}`);
  redirect(`/app/hastalar/${input.customer_id}?not=1`);
}
