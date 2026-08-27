"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

import {
  RANGES_PER_DAY,
  validateWeek,
  WEEKDAY_ORDER,
  weekToRows,
  type DayHours,
} from "./hours";

export type ResourceFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "color" | "hours", string>>;
};

const schema = z.object({
  name: z.string().trim().min(1, "Ad gerekli").max(120),
  title: z.string().trim().max(40),
  kind: z.enum(["staff", "room", "device"]),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/, "Renk #1A2B3C biçiminde olmalı"), z.literal("")]),
  branch_id: z.uuid("Şube seçin"),
  is_bookable: z.string().optional(),
  is_active: z.string().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).catch(0),
});

/**
 * Formdaki 7 gün × 2 aralık alanını haftaya çevirir.
 *
 * Alan adları `gun_<weekday>_<sıra>_bas` / `_bit`. Boş bırakılan aralık gün
 * kapalı demek; kısmen doldurulmuş aralığı `validateWeek` yakalar.
 */
function readWeek(formData: FormData): DayHours[] {
  return WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    ranges: Array.from({ length: RANGES_PER_DAY }, (_, index) => ({
      startsAt: String(formData.get(`gun_${weekday}_${index}_bas`) ?? "").trim(),
      endsAt: String(formData.get(`gun_${weekday}_${index}_bit`) ?? "").trim(),
    })).filter((range) => range.startsAt !== "" || range.endsAt !== ""),
  }));
}

function readForm(formData: FormData) {
  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    title: formData.get("title") ?? "",
    kind: formData.get("kind") ?? "staff",
    color: formData.get("color") ?? "",
    branch_id: formData.get("branch_id") ?? "",
    is_bookable: formData.get("is_bookable") ?? undefined,
    is_active: formData.get("is_active") ?? undefined,
    sort_order: formData.get("sort_order") ?? 0,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = String(issue.path[0] ?? "");
    return {
      error: {
        error: issue.message,
        fieldErrors: path === "color" ? { color: issue.message } : { name: issue.message },
      } as ResourceFormState,
    };
  }

  const week = readWeek(formData);
  const hoursError = validateWeek(week);
  if (hoursError) {
    return { error: { error: hoursError, fieldErrors: { hours: hoursError } } as ResourceFormState };
  }

  return {
    values: {
      name: parsed.data.name,
      title: parsed.data.title || null,
      kind: parsed.data.kind,
      color: parsed.data.color || null,
      branch_id: parsed.data.branch_id,
      is_bookable: parsed.data.is_bookable === "on",
      is_active: parsed.data.is_active === "on",
      sort_order: parsed.data.sort_order,
      week,
    },
  };
}

/**
 * Çalışma saatlerini kaynağın üstüne yeniden yazar.
 *
 * Sil-yaz yapılıyor, tek tek eşleme değil: haftalık saat küçük ve tamamı
 * formdan geliyor. `working_hours` satırlarına kimse referans vermiyor, o
 * yüzden silmek bir şeyi düşürmüyor.
 */
async function writeHours(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  resourceId: string,
  week: DayHours[],
): Promise<string | null> {
  const { error: deleteError } = await supabase
    .from("working_hours")
    .delete()
    .eq("resource_id", resourceId);
  if (deleteError) return `Çalışma saatleri güncellenemedi: ${deleteError.message}`;

  const rows = weekToRows(week).map((row) => ({
    tenant_id: tenantId,
    resource_id: resourceId,
    weekday: row.weekday,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
  }));
  if (rows.length === 0) return null;

  const { error } = await supabase.from("working_hours").insert(rows);
  return error ? `Çalışma saatleri yazılamadı: ${error.message}` : null;
}

/** Yeni kaynak: hekim, ünit ya da oda. */
export async function createResourceAction(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const { active } = await requireTenant();

  const read = readForm(formData);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resources")
    .insert({
      tenant_id: active.tenant.id,
      branch_id: values.branch_id,
      name: values.name,
      title: values.title,
      kind: values.kind,
      color: values.color,
      is_bookable: values.is_bookable,
      is_active: values.is_active,
      sort_order: values.sort_order,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") {
      return { error: "Kaynak ekleme yetkiniz yok. Bu işlem `resource.manage` izni ister." };
    }
    return { error: `Kaynak eklenemedi: ${error.message}` };
  }

  const hoursError = await writeHours(supabase, active.tenant.id, data.id, values.week);
  if (hoursError) return { error: hoursError };

  revalidatePath("/app/ekip");
  revalidatePath("/app");
  redirect(`/app/ekip?vurgu=${data.id}`);
}

/** Mevcut kaynağı ve saatlerini günceller. */
export async function updateResourceAction(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const { active } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "Kaynak bulunamadı." };

  const read = readForm(formData);
  if (read.error) return read.error;
  const values = read.values;

  const supabase = await createClient();

  const { error } = await supabase
    .from("resources")
    .update({
      branch_id: values.branch_id,
      name: values.name,
      title: values.title,
      kind: values.kind,
      color: values.color,
      is_bookable: values.is_bookable,
      is_active: values.is_active,
      sort_order: values.sort_order,
    })
    .eq("tenant_id", active.tenant.id)
    .eq("id", id);

  if (error) {
    if (error.code === "42501") return { error: "Bu kaynağı değiştirme yetkiniz yok." };
    return { error: `Kaynak güncellenemedi: ${error.message}` };
  }

  const hoursError = await writeHours(supabase, active.tenant.id, id, values.week);
  if (hoursError) return { error: hoursError };

  revalidatePath("/app/ekip");
  revalidatePath("/app");
  redirect(`/app/ekip?vurgu=${id}&kaydedildi=1`);
}

const toggleSchema = z.object({ id: z.uuid(), active: z.enum(["0", "1"]) });

/**
 * Kaynağı pasife alır ya da geri açar.
 *
 * Silme sunulmuyor: `appointments.resource_id` yabancı anahtarı `restrict`,
 * yani geçmişi olan bir hekim zaten silinemez — ve silinebilseydi de takvim
 * geçmişi eksilirdi. Pasif kaynak takvimde sütun açmaz, randevusu durur.
 */
export async function toggleResourceAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();

  const parsed = toggleSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active"),
  });
  if (!parsed.success) redirect("/app/ekip?hata=Geçersiz+istek");

  const supabase = await createClient();
  const { error } = await supabase
    .from("resources")
    .update({ is_active: parsed.data.active === "1" })
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id);

  revalidatePath("/app/ekip");
  revalidatePath("/app");
  redirect(
    error
      ? `/app/ekip?hata=${encodeURIComponent(`Değiştirilemedi: ${error.message}`)}`
      : `/app/ekip?vurgu=${parsed.data.id}`,
  );
}

export type RoleFormState = { error?: string };

const roleSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(2, "Rol adı en az 2 karakter olmalı").max(60),
});

/**
 * Rolün adını ve izin matrisini yeniden yazar.
 *
 * İzinler sil-yaz: matris zaten tamamen formdan geliyor ve
 * `role_permissions` satırlarına kimse referans vermiyor.
 *
 * Korumalı rol (owner) buradan geçmez — politika da reddeder. İkisi birden
 * duruyor çünkü arayüzdeki kontrol açıklama, politikadaki kontrol güvenlik.
 */
export async function updateRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const { active } = await requireTenant();

  const parsed = roleSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("id, is_protected")
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!role) return { error: "Rol bulunamadı ya da erişiminiz yok." };
  if (role.is_protected) {
    return { error: "Bu rol korumalı: kurum sahibinin yetkisi kısıtlanamaz." };
  }

  const { data: catalog } = await supabase.from("permissions").select("key, scopes");
  if (!catalog) return { error: "İzin listesi okunamadı." };

  type Scope = Enums<"permission_scope">;
  const rows: { role_id: string; permission_key: string; scope: Scope }[] = [];
  for (const permission of catalog) {
    const chosen = String(formData.get(`izin_${permission.key}`) ?? "");
    const scopes: Scope[] = permission.scopes ?? [];
    // Formdan gelen kapsam iznin desteklediklerinden biri olmak zorunda
    const scope = scopes.find((allowed) => allowed === chosen);
    if (!scope) continue;
    rows.push({ role_id: role.id, permission_key: permission.key, scope });
  }

  const { error: labelError } = await supabase
    .from("roles")
    .update({ label: parsed.data.label })
    .eq("id", role.id);
  if (labelError) {
    if (labelError.code === "42501") return { error: "Rol düzenleme yetkiniz yok." };
    return { error: `Rol adı güncellenemedi: ${labelError.message}` };
  }

  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", role.id);
  if (deleteError) {
    if (deleteError.code === "42501") return { error: "İzin düzenleme yetkiniz yok." };
    return { error: `İzinler güncellenemedi: ${deleteError.message}` };
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("role_permissions").insert(rows);
    if (error) return { error: `İzinler yazılamadı: ${error.message}` };
  }

  revalidatePath("/app/ekip/roller");
  revalidatePath(`/app/ekip/roller/${role.id}`);
  redirect(`/app/ekip/roller?vurgu=${role.id}&kaydedildi=1`);
}
