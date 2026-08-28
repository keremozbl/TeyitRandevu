import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/lib/auth/session";
import { parseBookingRules } from "@/lib/domain";
import { timeZoneOptions } from "@/lib/settings/timezone";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function AyarlarPage({
  searchParams,
}: {
  searchParams: Promise<{ kaydedildi?: string }>;
}) {
  const { active } = await requireTenant();
  const { kaydedildi } = await searchParams;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("booking_rules")
    .eq("tenant_id", active.tenant.id)
    .maybeSingle();

  const rules = parseBookingRules(settings?.booking_rules);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg tracking-tight">Ayarlar</h1>
        <p className="max-w-2xl text-[13px] text-ink-2">
          Kurumun kimliği ve randevu kuralları. Buradaki bir sayı yanlış girilirse hata vermez;
          randevu davranışı sessizce değişir, o yüzden her alanın altında ne değiştirdiği yazıyor.
        </p>
      </div>

      {kaydedildi && <Alert tone="success">Ayarlar kaydedildi.</Alert>}

      <SettingsForm
        defaults={{
          name: active.tenant.name,
          timezone: active.tenant.timezone,
          minLeadMinutes: rules.min_lead_minutes,
          maxAdvanceDays: rules.max_advance_days,
          cancelWindowMinutes: rules.cancel_window_minutes,
          holdMinutes: rules.hold_minutes,
          slotStepMinutes: rules.slot_step_minutes,
        }}
        timeZones={timeZoneOptions(active.tenant.timezone)}
      />

      <section className="flex max-w-2xl flex-col gap-1 border-t border-border pt-4">
        <h2 className="text-[13px] font-medium text-ink-2">Burada olmayanlar</h2>
        <p className="text-[13px] text-ink-3">
          Şube saatleri ve izinler ekip ekranında, hizmet süreleri hizmet ekranında. Bildirim
          şablonları, marka rengi ve public randevu sayfası henüz yok.
        </p>
      </section>
    </div>
  );
}
