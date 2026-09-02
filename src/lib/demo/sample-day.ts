import type { SupabaseClient } from "@supabase/supabase-js";

import { utcToPlainDate, zonedTimeToUtc } from "@/lib/domain";
import type { Database } from "@/lib/supabase/types";

/**
 * Yeni kurulan demo kurumuna gerçekçi bir gün yazar.
 *
 * Boş bir takvim hiçbir şey göstermez: ziyaretçi kurulumu bitirdiğinde
 * karşısına dolu bir gün çıkmalı — farklı durumlarda randevular, bir izin,
 * gerçek hizmet süreleri.
 *
 * Randevular `create_appointment` RPC'siyle ve ZİYARETÇİNİN kendi oturumuyla
 * yazılıyor: yani demo verisi de RLS'ten, çakışma kısıtından ve durum
 * tetikleyicilerinden geçiyor. Ayrıcalıklı istemciyle yazılsaydı demo, ürünün
 * gerçekten yaptığı şeyi değil, bizim taklidimizi gösterirdi.
 *
 * HİÇBİR HATA YUKARI ÇIKMAZ: örnek veri yazılamazsa kurulum yine de
 * tamamlanmış sayılır, ziyaretçi boş ama çalışan bir takvime düşer.
 */

type Client = SupabaseClient<Database>;
type Status = Database["public"]["Enums"]["appointment_status"];

const PEOPLE: [string, string][] = [
  ["Hatice Aydın", "+905321112233"],
  ["Mehmet Yıldırım", "+905331112244"],
  ["Zeynep Karaca", "+905341112255"],
  ["Ali Vural", "+905351112266"],
  ["Elif Şahin", "+905361112277"],
  ["Burak Demirci", "+905371112288"],
  ["Ayşe Korkmaz", "+905381112299"],
  ["Canan Öz", "+905391112200"],
  ["Serkan Ateş", "+905301112211"],
];

/**
 * Sütun başına gün planı: sırayla hangi durumlar görünsün.
 *
 * Saat YOK, çünkü saat kurumun kendi çalışma penceresinden hesaplanıyor:
 * diyetisyenin öğle arası varken berberin yok, biri 09:00 diğeri 10:00
 * açıyor. Sabit ofsetlerle yazıldığında öğle arasına denk gelen randevular
 * sessizce düşüyor ve demo yarım bir gün gösteriyordu.
 */
const PLAN: { status: Status; note?: string }[][] = [
  [
    { status: "completed" },
    { status: "arrived" },
    { status: "confirmed", note: "İkinci seans" },
    { status: "no_show" },
  ],
  [
    { status: "completed" },
    { status: "confirmed" },
    { status: "pending" },
    { status: "cancelled", note: "Erteledi, tekrar arayacak" },
  ],
  [{ status: "confirmed" }, { status: "pending" }],
];

/** Randevular arasında bırakılan boşluk — gün sıkışık görünmesin. */
const GAP_MIN = 30;

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function toClock(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 30, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export async function seedSampleDay(
  supabase: Client,
  { tenantId, timeZone }: { tenantId: string; timeZone: string },
): Promise<void> {
  try {
    const today = utcToPlainDate(new Date(), timeZone);
    const at = (time: string) => zonedTimeToUtc(today, time, timeZone).toISOString();
    // Postgres'in hafta günü: pazar 0. `working_hours.weekday` de öyle.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

    const [{ data: branch }, { data: resources }, { data: services }] = await Promise.all([
      supabase.from("branches").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle(),
      supabase
        .from("resources")
        .select("id, kind, sort_order")
        .eq("tenant_id", tenantId)
        .eq("kind", "staff")
        .order("sort_order"),
      supabase
        .from("services")
        .select("id, duration_min")
        .eq("tenant_id", tenantId)
        .order("sort_order"),
    ]);

    if (!branch || !resources?.length || !services?.length) return;

    const { data: hours } = await supabase
      .from("working_hours")
      .select("resource_id, starts_at, ends_at")
      .eq("tenant_id", tenantId)
      .eq("weekday", weekday);

    // Kayıtlar: telefon kuruma özel benzersiz, o yüzden tek seferde yazılıyor.
    const { data: customers } = await supabase
      .from("customers")
      .insert(
        PEOPLE.map(([full_name, phone]) => ({
          tenant_id: tenantId,
          branch_id: branch.id,
          full_name,
          phone,
          source: "panel" as const,
        })),
      )
      .select("id");

    if (!customers?.length) return;

    let person = 0;
    const writes: PromiseLike<unknown>[] = [];

    resources.slice(0, PLAN.length).forEach((resource, column) => {
      // Kaynağın bugünkü çalışma pencereleri. Öğle arası, iki ayrı pencere
      // olarak duruyor; randevular ikisine de dağıtılıyor.
      const windows = (hours ?? [])
        .filter((row) => row.resource_id === resource.id)
        .map((row) => ({
          start: toMinutes(row.starts_at.slice(0, 5)),
          end: toMinutes(row.ends_at.slice(0, 5)),
        }))
        .sort((a, b) => a.start - b.start);

      if (windows.length === 0) windows.push({ start: 9 * 60, end: 18 * 60 });

      let index = 0;
      let cursor = windows[0].start;

      PLAN[column].forEach((item, order) => {
        const service = services[(column * PLAN.length + order) % services.length];

        // Sığmıyorsa sonraki pencereye geç; hiç yer kalmadıysa bu kaydı atla.
        while (index < windows.length && cursor + service.duration_min > windows[index].end) {
          index += 1;
          if (index < windows.length) cursor = windows[index].start;
        }
        if (index >= windows.length) return;

        const startsAt = cursor;
        cursor += service.duration_min + GAP_MIN;

        const customerId = customers[person % customers.length].id;
        person += 1;

        // İptal ve gelmedi doğrudan yazılmaz: normal randevu açılır, sonra
        // durumu değiştirilir — damgaları tetikleyici işlesin.
        const initial =
          item.status === "cancelled" || item.status === "no_show" ? "confirmed" : item.status;

        writes.push(
          supabase
            .rpc("create_appointment", {
              _tenant_id: tenantId,
              _branch_id: branch.id,
              _resource_id: resource.id,
              _starts_at: at(toClock(startsAt)),
              _duration_min: service.duration_min,
              _status: initial,
              _service_id: service.id,
              _customer_id: customerId,
              _notes: item.note,
            })
            .then(async ({ data: id, error }) => {
              if (error || !id || initial === item.status) return;
              await supabase
                .from("appointments")
                .update({
                  status: item.status,
                  cancelled_reason:
                    item.status === "cancelled" ? "Erteledi, tekrar arayacak" : null,
                })
                .eq("id", id);
            }),
        );
      });
    });

    // İzin: ızgarada taralı alan olarak görünür, "boşluk hep boş değildir".
    // Günün son penceresinin sonuna konuyor ki randevularla çakışmasın.
    const last = resources[0];
    const lastWindow = (hours ?? [])
      .filter((row) => row.resource_id === last.id)
      .map((row) => ({ start: toMinutes(row.starts_at.slice(0, 5)), end: toMinutes(row.ends_at.slice(0, 5)) }))
      .sort((a, b) => a.end - b.end)
      .at(-1) ?? { start: 9 * 60, end: 18 * 60 };

    if (lastWindow.end - lastWindow.start > 90) {
      writes.push(
        supabase.from("time_off").insert({
          tenant_id: tenantId,
          resource_id: last.id,
          starts_at: at(toClock(lastWindow.end - 60)),
          ends_at: at(toClock(lastWindow.end)),
          reason: "Toplantı",
        }),
      );
    }

    await Promise.allSettled(writes);
  } catch (error) {
    console.error("[vitrin] örnek gün yazılamadı:", error);
  }
}
