import type { Metadata } from "next";
import Link from "next/link";

import { BookingShare } from "@/components/app/booking-share";
import { requireTenant } from "@/lib/auth/session";
import { logoUrl, parseBranding } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

import { BrandingForm } from "../branding-form";

export const metadata: Metadata = { title: "Randevu sayfası" };

/**
 * Randevu sayfasının kurum tarafındaki karşılığı: adresi, karekodu ve görünüşü.
 *
 * Ayarlar'dan ayrı bir sayfa olmasının sebebi sıklık değil sıra: kurum bu
 * ekranı ilk gün açıp bağlantıyı alıyor, sonra aylarca açmıyor. Ayarların
 * içinde bir bölüm olsaydı min/maks randevu süresi gibi günlük olmayan ama
 * düzenli ayarların arasında kaybolurdu.
 */
export default async function RandevuSayfasiPage() {
  const { active } = await requireTenant();

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("branding")
    .eq("tenant_id", active.tenant.id)
    .maybeSingle();

  const branding = parseBranding(settings?.branding);

  return (
    <div className="flex max-w-2xl flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/app/ayarlar"
          className="w-fit text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          ‹ Ayarlar
        </Link>
        <h1 className="text-lg tracking-tight">Randevu sayfası</h1>
        <p className="text-[13px] text-ink-2">
          {active.terms.customer_plural} randevuyu buradan alıyor. Bağlantıyı paylaşmadığınız
          sürece internetten randevu gelmez — sayfa hazır olsa bile kimse adresini bilmiyor.
        </p>
      </div>

      <BookingShare slug={active.tenant.slug} tenantName={active.tenant.name} />

      <div className="border-t border-border pt-4">
        <BrandingForm branding={branding} logoUrl={logoUrl(branding.logo_path)} />
      </div>
    </div>
  );
}
