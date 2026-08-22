import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Takvim" };

export default async function TakvimPage() {
  const { active } = await requireTenant();

  const today = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: active.tenant.timezone,
  }).format(new Date());

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Takvim</h1>
        <p className="font-mono text-[13px] text-ink-3">{today}</p>
      </div>

      {/* Boş durum tasarlanır — kırık ekran gösterilmez */}
      <div className="flex flex-col items-start gap-2 rounded border border-dashed border-border p-8">
        <p className="text-ink">Takvim ızgarası Faz 1&apos;in sonraki adımında geliyor.</p>
        <p className="max-w-md text-[13px] text-ink-2">
          Kaynak sütunları, sürükle-bırak taşıma, şu an çizgisi ve çakışma
          kontrolü. Şema ve çakışma kısıtı hazır; eksik olan arayüz.
        </p>
      </div>
    </div>
  );
}
