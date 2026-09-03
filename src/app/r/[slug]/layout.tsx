import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingPage } from "@/lib/booking/queries";
import { logoUrl } from "@/lib/domain";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Public randevu sayfasının kabuğu.
 *
 * Panelin kabuğundan (`/app/layout.tsx`) ayrı: burada gezinme menüsü, kurum
 * değiştirici ya da çıkış yok. Ziyaretçi hasta; ekranda yalnız randevusuyla
 * ilgili şeyler olmalı.
 *
 * Yoğunluk da farklı: panel günde sekiz saat kullanılıyor ve sıkı; bu sayfa
 * telefondan bir kez açılıyor ve dokunma hedefleri geniş olmalı.
 *
 * KURUMUN RENGİ burada uygulanıyor: `--accent` ve türevleri kabuğun üzerinde
 * ezildiği için sayfadaki her düğme, seçili saat ve odak halkası kurumun
 * rengine dönüyor — bileşenlerin hiçbiri değişmiyor. Türevler `color-mix`
 * ile üretiliyor, yani kurum tek bir renk seçiyor.
 *
 * `--accent-ink` beyaza sabitleniyor: paletteki altı ton da beyaz metinle
 * okunur (bkz. lib/domain/branding.ts) ve koyu temada varsayılan mürekkep
 * koyu olduğu için sabitlemezsek düğme yazısı kaybolurdu.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return { title: { absolute: "Randevu" } };

  const page = await getBookingPage(slug);
  return {
    title: { absolute: page ? `${page.tenant.name} · Randevu Al` : "Randevu" },
    description: page ? `${page.tenant.name} için internetten randevu alın.` : undefined,
    // Kurumların public sayfası aranabilir olmalı, ama randevu ve bilgi
    // adımları değil: onlar token taşıyor.
    robots: { index: true, follow: true },
  };
}

export default async function BookingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) notFound();

  const page = await getBookingPage(slug);
  if (!page) notFound();

  const branch = page.branches[0] ?? null;
  const logo = logoUrl(page.branding.logo_path);

  const accent = {
    "--accent": page.branding.accent,
    "--accent-hover": `color-mix(in oklab, ${page.branding.accent} 82%, black)`,
    "--accent-soft": `color-mix(in oklab, ${page.branding.accent} 14%, var(--surface))`,
    "--accent-ink": "#FFFFFF",
    "--focus": page.branding.accent,
  } as React.CSSProperties;

  return (
    <div className="flex min-h-full flex-col bg-bg" style={accent}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3.5">
          <Link
            href={`/r/${slug}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 no-underline"
          >
            {logo && (
              <Image
                src={logo}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded object-contain"
                priority
              />
            )}
            <span className="min-w-0 truncate text-[15px] font-semibold text-ink">
              {page.tenant.name}
            </span>
          </Link>
          {branch?.phone && (
            <a
              href={`tel:${branch.phone}`}
              className="shrink-0 rounded border border-border px-2.5 py-1 text-[13px] text-ink-2 no-underline transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:text-ink"
            >
              Telefonla Ara
            </a>
          )}
        </div>
      </header>

      {page.branding.about && (
        <div className="border-b border-border bg-surface-2">
          <p className="mx-auto w-full max-w-2xl px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            {page.branding.about}
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>

      <footer className="mt-6 border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-5 text-[13px] text-ink-3">
          {branch?.address && <p className="text-ink-2">{branch.address}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/r/${slug}/kvkk`} className="text-ink-2 underline underline-offset-2">
              KVKK Aydınlatma Metni
            </Link>
            <span aria-hidden="true">·</span>
            <span>
              Randevu altyapısı{" "}
              <span translate="no" className="text-ink-2">
                TeyitRandevu
              </span>
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}
