import type { Metadata } from "next";
import Link from "next/link";

import { SetupNotice } from "@/app/app/setup-notice";
import { BookingShare } from "@/components/app/booking-share";
import { SectorIllustration } from "@/components/marketing/sector-illustration";
import { requireTenant } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Randevu sayfanız hazır" };

/**
 * Kurulumun son ekranı.
 *
 * Eskiden kurulum biter bitmez panele atıyorduk ve kurum, az önce kendi
 * seçtiği adresi bir daha görmüyordu. Ürünün tek çıktısı o bağlantı:
 * paylaşılmazsa internetten tek randevu gelmez ve kurum "bu program işe
 * yaramadı" diye bırakır. Bu yüzden panelden önce bir ekran var ve tek
 * işi bağlantıyı eline vermek.
 *
 * Kanal listesi burada gösterilmiyor (`compact`): ilk dakikada üç kanal
 * birden okutmak kimseyi Instagram'a göndermiyor, yalnızca ekranı
 * uzatıyor. Hepsi ayarlardaki kalıcı sayfada duruyor ve oraya aşağıdan
 * bağlantı var.
 */
export default async function KurulumHazirPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { active } = await requireTenant();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-5">
        <SectorIllustration sector="kurulum" priority className="h-36 !p-4" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl tracking-tight text-pretty">
            {active.tenant.name} kuruldu
          </h1>
          <p className="text-ink-2">
            Takviminiz, hizmetleriniz ve çalışma saatleriniz hazır. Geriye tek şey kaldı:
            randevu sayfanızın adresini müşterilerinizin göreceği yere koymak.
          </p>
        </div>
      </header>

      <BookingShare slug={active.tenant.slug} tenantName={active.tenant.name} compact />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Link
          href="/app"
          className="inline-flex h-9 items-center justify-center rounded border border-accent bg-accent px-3.5 font-medium text-accent-ink no-underline transition-[background-color,border-color,color] duration-150 hover:border-accent-hover hover:bg-accent-hover"
        >
          Panele geç
        </Link>
        <Link
          href="/app/ayarlar/randevu-sayfasi"
          className="text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          Sayfanın logosunu ve rengini ayarla
        </Link>
      </div>

      <p className="text-[13px] text-ink-3">
        Bu bağlantı kaybolmaz: panelde Ayarlar → Randevu sayfası altında her zaman durur.
      </p>
    </main>
  );
}
