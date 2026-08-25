"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { zonedTimeToUtc } from "@/lib/domain";
import { findNearestSlot } from "@/lib/scheduling/queries";
import { createClient } from "@/lib/supabase/server";

import { calendarHref, conflictMessage } from "./messages";
import type { AppointmentFormState } from "./actions";

const updateSchema = z.object({
  id: z.uuid(),
  resource_id: z.uuid("Kaynak seçin"),
  service_id: z.union([z.uuid(), z.literal("")]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih geçersiz"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Saat geçersiz"),
  duration_min: z.coerce.number().int().min(5, "Süre en az 5 dakika").max(1440),
  // İptal ve gelmedi buradan geçmez; ikisinin de kendi eylemi var
  status: z.enum(["pending", "confirmed", "arrived", "completed"]),
  notes: z.string().trim().max(2000),
});

/**
 * Randevuyu taşır, süresini, kaynağını ya da hizmetini değiştirir.
 *
 * Yeni yerin dolu olup olmadığını yine veritabanı söyler (Kural 1); buradaki
 * tek iş hatayı cümleye çevirmek ve boştaki en yakın saati önermek.
 */
export async function updateAppointmentAction(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { active } = await requireTenant();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    resource_id: formData.get("resource_id"),
    service_id: formData.get("service_id") ?? "",
    date: formData.get("date"),
    time: formData.get("time"),
    duration_min: formData.get("duration_min"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("appointments")
    .select("branch_id, branches(timezone)")
    .eq("id", input.id)
    .maybeSingle();
  if (!current) return { error: "Randevu bulunamadı ya da erişiminiz yok." };

  // Randevu başka şubenin kaynağına taşınamaz: satırdaki branch_id ile kaynağın
  // şubesi ayrışırsa şube kapsamlı yetkiler yanlış hesaplanır.
  const { data: resource } = await supabase
    .from("resources")
    .select("branch_id")
    .eq("id", input.resource_id)
    .maybeSingle();
  if (!resource || resource.branch_id !== current.branch_id) {
    return { error: "Seçilen kaynak bu şubeye ait değil." };
  }

  const timeZone = current.branches?.timezone?.trim() || active.tenant.timezone;
  const startsAt = zonedTimeToUtc(input.date, input.time, timeZone);
  const endsAt = new Date(startsAt.getTime() + input.duration_min * 60_000);

  let bufferBeforeMin = 0;
  let bufferAfterMin = 0;
  if (input.service_id) {
    const { data: service } = await supabase
      .from("services")
      .select("buffer_before_min, buffer_after_min")
      .eq("tenant_id", active.tenant.id)
      .eq("id", input.service_id)
      .maybeSingle();
    if (!service) return { error: "Seçilen hizmet bulunamadı." };
    bufferBeforeMin = service.buffer_before_min;
    bufferAfterMin = service.buffer_after_min;
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      resource_id: input.resource_id,
      service_id: input.service_id || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      buffer_before_min: bufferBeforeMin,
      buffer_after_min: bufferAfterMin,
      status: input.status,
      notes: input.notes || null,
    })
    .eq("id", input.id);

  if (error) {
    if (error.code === "23P01") {
      // Öneri hesabında randevunun kendisi de dolu görünür, yani şu anki saati
      // önerilmez. Zaten oradan taşınmak isteniyor.
      const slot = await findNearestSlot({
        resourceId: input.resource_id,
        date: input.date,
        timeZone,
        service: { durationMin: input.duration_min, bufferBeforeMin, bufferAfterMin },
        target: startsAt,
      });
      return {
        error: conflictMessage(slot, timeZone, input.date),
        fieldErrors: { time: "Bu saat dolu" },
      };
    }
    if (error.code === "42501") return { error: "Bu randevuyu değiştirme yetkiniz yok." };
    return { error: `Randevu güncellenemedi: ${error.message}` };
  }

  revalidatePath("/app");
  redirect(calendarHref({ tarih: input.date, vurgu: input.id }));
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "confirmed", "arrived", "completed", "no_show"]),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sube: z.string().optional(),
});

/**
 * Hızlı durum değişikliği: geldi, tamamlandı, gelmedi.
 *
 * Damgalar ve hastanın gelmeme sayacı burada değil tetikleyicide işlenir —
 * aynı kural public iptal bağlantısı ve ileride IVR için de geçerli olacak.
 */
export async function setAppointmentStatusAction(formData: FormData): Promise<void> {
  await requireTenant();

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    tarih: formData.get("tarih"),
    sube: formData.get("sube") ?? undefined,
  });
  if (!parsed.success) redirect(calendarHref({ hata: "Durum değiştirilemedi: geçersiz istek." }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  revalidatePath("/app");
  redirect(
    calendarHref({
      tarih: parsed.data.tarih,
      sube: parsed.data.sube,
      vurgu: error ? undefined : parsed.data.id,
      hata: error ? `Durum değiştirilemedi: ${error.message}` : undefined,
    }),
  );
}

const cancelSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().max(500),
  previous: z.enum(["pending", "confirmed", "arrived", "completed"]),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sube: z.string().optional(),
});

/**
 * İptal — silme değil. Geçmiş randevu aynı zamanda ticari ve tıbbi kayıttır;
 * `appointments` tablosunda DELETE politikası yok.
 *
 * Takvime dönüşte geri alma şeridi açılır: yıkıcı işlem ya onay ya da geri
 * alma penceresi ister.
 */
export async function cancelAppointmentAction(formData: FormData): Promise<void> {
  await requireTenant();

  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
    previous: formData.get("previous"),
    tarih: formData.get("tarih"),
    sube: formData.get("sube") ?? undefined,
  });
  if (!parsed.success) redirect(calendarHref({ hata: "Randevu iptal edilemedi: geçersiz istek." }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", cancelled_reason: parsed.data.reason || null })
    .eq("id", parsed.data.id);

  revalidatePath("/app");
  redirect(
    calendarHref({
      tarih: parsed.data.tarih,
      sube: parsed.data.sube,
      geri: error ? undefined : parsed.data.id,
      onceki: error ? undefined : parsed.data.previous,
      hata: error ? `Randevu iptal edilemedi: ${error.message}` : undefined,
    }),
  );
}

/**
 * İptali geri alır. Bu arada slot başkasına verilmiş olabilir; o zaman
 * veritabanı reddeder ve kullanıcı bunu takvimde görür.
 */
export async function undoCancelAction(formData: FormData): Promise<void> {
  await requireTenant();

  const parsed = cancelSchema.omit({ reason: true }).safeParse({
    id: formData.get("id"),
    previous: formData.get("onceki"),
    tarih: formData.get("tarih"),
    sube: formData.get("sube") ?? undefined,
  });
  if (!parsed.success) redirect(calendarHref({ hata: "Geri alınamadı: geçersiz istek." }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: parsed.data.previous })
    .eq("id", parsed.data.id);

  revalidatePath("/app");
  redirect(
    calendarHref({
      tarih: parsed.data.tarih,
      sube: parsed.data.sube,
      vurgu: error ? undefined : parsed.data.id,
      hata:
        error?.code === "23P01"
          ? "Geri alınamadı: bu saat bu arada başka bir randevuya verilmiş."
          : error
            ? `Geri alınamadı: ${error.message}`
            : undefined,
    }),
  );
}
