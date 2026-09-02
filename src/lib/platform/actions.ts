"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Demo talebinin durumunu ve satış notunu günceller.
 *
 * Yetki RLS'te: `demo_requests_update` politikası `private.is_platform_admin()`
 * arıyor. Yetkisi olmayan kullanıcının UPDATE'i sessizce 0 satır döner —
 * burada ayrıca kontrol edilmiyor, çünkü ikinci bir kapı yazmak birinin
 * unutulması demek.
 */

const schema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "contacted", "qualified", "closed"]),
  note: z.string().trim().max(2000).optional(),
});

export async function updateDemoRequestAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;

  const { id, status, note } = parsed.data;
  const supabase = await createClient();

  // `handled_at` ilk işleme alma anıdır, son düzenleme anı değil: notu üç gün
  // sonra güncellemek "ne zaman dönüş yapıldı" cevabını değiştirmemeli. SQL'de
  // coalesce yazamadığımız için mevcut değer okunuyor.
  const { data: current } = await supabase
    .from("demo_requests")
    .select("handled_at")
    .eq("id", id)
    .maybeSingle();

  const handledAt =
    status === "new" ? null : (current?.handled_at ?? new Date().toISOString());

  await supabase
    .from("demo_requests")
    .update({ status, internal_note: note || null, handled_at: handledAt })
    .eq("id", id);

  revalidatePath("/yonetim/talepler");
}
