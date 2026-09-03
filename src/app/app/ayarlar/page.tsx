import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { CUSTOMER_ERASE, loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { logoUrl, parseBookingRules, parseBranding } from "@/lib/domain";
import { siteUrl } from "@/lib/marketing/site-url";
import { countOpenErasureRequests } from "@/lib/legal/erasure";
import { timeZoneOptions } from "@/lib/settings/timezone";
import { createClient } from "@/lib/supabase/server";

import { BrandingForm } from "./branding-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function AyarlarPage({
  searchParams,
}: {
  searchParams: Promise<{ kaydedildi?: string }>;
}) {
  const { active } = await requireTenant();
  const { kaydedildi } = await searchParams;

  const permissions = await loadPermissions();
  const canReadAudit = permissions.can("audit.read");
  const canErase = permissions.can(CUSTOMER_ERASE);
  const openRequests = canErase ? await countOpenErasureRequests(active.tenant.id) : 0;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("booking_rules, branding")
    .eq("tenant_id", active.tenant.id)
    .maybeSingle();

  const rules = parseBookingRules(settings?.booking_rules);
  const branding = parseBranding(settings?.branding);

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

      <BrandingForm
        branding={branding}
        logoUrl={logoUrl(branding.logo_path)}
        publicHref={`${siteUrl()}/r/${active.tenant.slug}`}
      />

      {canErase && (
        <section className="flex max-w-2xl flex-col gap-2 border-t border-border pt-4">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
            Silme talepleri
            {openRequests > 0 && (
              <span
                data-numeric
                className="rounded-sm bg-st-pending-soft px-1.5 py-0.5 text-[12px] font-normal text-st-pending"
              >
                {openRequests} bekliyor
              </span>
            )}
          </h2>
          <p className="text-[13px] text-ink-2">
            &ldquo;Kaydımı silin&rdquo; başvuruları ve verilen cevaplar. KVKK cevap süresi otuz
            gün; sayaç talebin geldiği günden işliyor.
          </p>
          <Link
            href="/app/ayarlar/silme-talepleri"
            className="inline-flex h-8 w-fit items-center rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
          >
            Talepleri aç
          </Link>
        </section>
      )}

      {canReadAudit && (
        <section className="flex max-w-2xl flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-[15px] font-semibold text-ink">Denetim kaydı</h2>
          <p className="text-[13px] text-ink-2">
            {active.terms.customer_singular} kaydına kimin ne zaman eriştiği. KVKK gereği
            tutuluyor; silinemez ve değiştirilemez.
          </p>
          <Link
            href="/app/ayarlar/denetim"
            className="inline-flex h-8 w-fit items-center rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
          >
            Kayıtları aç
          </Link>
        </section>
      )}

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
