"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTenant } from "@/lib/auth/session";
import { parseBookingRules, utcToPlainDate, zonedTimeToUtc, type Slot } from "@/lib/domain";
import { findNearestSlot } from "@/lib/scheduling/queries";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils/phone";

export type AppointmentFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"customer" | "customer_name" | "customer_phone" | "time", string>>;
};

const schema = z.object({
  branch_id: z.uuid("Şube seçilmedi"),
  resource_id: z.uuid("Kaynak seçin"),
  service_id: z.union([z.uuid(), z.literal("")]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih geçersiz"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Saat geçersiz"),
  duration_min: z.coerce.number().int().min(5, "Süre en az 5 dakika").max(1440),
  status: z.enum(["pending", "confirmed"]),
  customer: z.string().min(1, "Hasta seçin ya da yeni kayıt açın"),
  customer_name: z.string().trim().max(160),
  customer_phone: z.string().trim().max(32),
  notes: z.string().trim().max(2000),
});

/**
 * Panelden randevu oluşturur.
 *
 * Çakışma kontrolü BURADA YAPILMAZ (Kural 1): "önce sorgula sonra yaz" iki
 * eşzamanlı istekte çift rezervasyon üretir. Yazma denenir, veritabanının
 * exclusion constraint'i reddederse hata insanın anlayacağı bir cümleye
 * çevrilir — ve boşta kalan en yakın saat önerilir.
 */
export async function createAppointmentAction(
  _prev: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { active } = await requireTenant();

  const parsed = schema.safeParse({
    branch_id: formData.get("branch_id"),
    resource_id: formData.get("resource_id"),
    service_id: formData.get("service_id") ?? "",
    date: formData.get("date"),
    time: formData.get("time"),
    duration_min: formData.get("duration_min"),
    status: formData.get("status"),
    customer: formData.get("customer") ?? "",
    customer_name: formData.get("customer_name") ?? "",
    customer_phone: formData.get("customer_phone") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const isNewCustomer = input.customer === "new";
  if (isNewCustomer && input.customer_name.length < 2) {
    return {
      error: "Yeni hasta için ad soyad gerekli.",
      fieldErrors: { customer_name: "Ad soyad en az 2 karakter olmalı" },
    };
  }

  let phone: string | undefined;
  if (isNewCustomer && input.customer_phone) {
    const normalized = toE164(input.customer_phone);
    if (!normalized) {
      return {
        error: "Telefon numarası okunamadı.",
        fieldErrors: { customer_phone: "Örnek: 0555 123 45 67" },
      };
    }
    phone = normalized;
  }

  const supabase = await createClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, timezone")
    .eq("tenant_id", active.tenant.id)
    .eq("id", input.branch_id)
    .maybeSingle();
  if (!branch) return { error: "Şube bulunamadı ya da bu şubeye erişiminiz yok." };

  const timeZone = branch.timezone?.trim() || active.tenant.timezone;
  const startsAt = zonedTimeToUtc(input.date, input.time, timeZone);

  // Tamponlar hizmetten gelir; süre formda değiştirilebilir çünkü aynı işlem
  // her hastada aynı sürmez.
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

  const { data: appointmentId, error } = await supabase.rpc("create_appointment", {
    _tenant_id: active.tenant.id,
    _branch_id: input.branch_id,
    _resource_id: input.resource_id,
    _starts_at: startsAt.toISOString(),
    _duration_min: input.duration_min,
    _status: input.status,
    _service_id: input.service_id || undefined,
    _customer_id: isNewCustomer ? undefined : input.customer,
    _customer_name: isNewCustomer ? input.customer_name : undefined,
    _customer_phone: phone,
    _notes: input.notes || undefined,
  });

  if (error) {
    if (error.code === "23P01") {
      const { data: settings } = await supabase
        .from("tenant_settings")
        .select("booking_rules")
        .eq("tenant_id", active.tenant.id)
        .maybeSingle();

      const slot = await findNearestSlot({
        resourceId: input.resource_id,
        date: input.date,
        timeZone,
        service: {
          durationMin: input.duration_min,
          bufferBeforeMin,
          bufferAfterMin,
        },
        target: startsAt,
        stepMinutes: parseBookingRules(settings?.booking_rules).slot_step_minutes,
      });

      return {
        error: conflictMessage(slot, timeZone, input.date),
        fieldErrors: { time: "Bu saat dolu" },
      };
    }

    if (error.code === "42501") {
      return { error: "Bu kaynağa randevu yazma yetkiniz yok. Yöneticinizden rol güncellemesi isteyin." };
    }
    if (error.code === "23514" || error.code === "22P02") {
      return { error: "Girilen bir değer kuralı bozuyor: telefon biçimini ve süreyi kontrol edin." };
    }
    return { error: `Randevu oluşturulamadı: ${error.message}` };
  }

  revalidatePath("/app");
  // vurgu: yeni kayıt ızgarada işaretlensin — "kaydedildi mi?" sorusu kalmasın
  redirect(`/app?tarih=${input.date}&sube=${input.branch_id}&vurgu=${appointmentId}`);
}

/** Hata mesajı sorunu değil çözümü söyler: dolu saat yerine boş saati. */
function conflictMessage(slot: Slot | null, timeZone: string, requestedDate: string): string {
  if (!slot) {
    return "Bu saat dolu. Bu kaynakta önümüzdeki bir hafta içinde uygun saat yok — başka bir kaynak ya da tarih seçin.";
  }

  const sameDay = utcToPlainDate(slot.startsAt, timeZone) === requestedDate;
  const formatted = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { weekday: "long", day: "numeric", month: "long" }),
  }).format(slot.startsAt);

  return `Bu saat dolu — en yakın uygun saat ${formatted}.`;
}
