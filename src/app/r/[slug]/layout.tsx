import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingPage } from "@/lib/booking/queries";
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

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3.5">
          <Link
            href={`/r/${slug}`}
            className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink no-underline"
          >
            {page.tenant.name}
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
