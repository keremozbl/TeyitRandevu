import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { PRODUCT } from "@/lib/marketing/content";

/**
 * Pazarlama sitesinin kabuğu.
 *
 * Panelden ayrı bir route grubu: `/app` yoğun bir operasyon aracı, burası
 * okunacak bir sayfa. Token'lar aynı, ölçek farklı.
 *
 * Bu grupta Supabase'e hiç gidilmiyor — sayfalar statik üretiliyor ve
 * Frankfurt'a tur atmıyor. Tek istisna demo formu; o da bir server action.
 */

const NAV = [
  { href: "/#urun", label: "Ürün" },
  { href: "/#kvkk", label: "KVKK" },
  { href: "/fiyat", label: "Fiyat" },
  { href: "/iletisim", label: "İletişim" },
];

export default function PazarlamaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#icerik"
        className="sr-only rounded border border-border bg-surface px-3 py-2 text-[13px] text-ink focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-20"
      >
        İçeriğe geç
      </a>

      {/* Saydam + bulanık başlık bilerek yok: glassmorphism kaçınılanlar
          listesinde (globals.css) ve altından kayan yoğun ızgarayı okunmaz
          yapıyor. Panel başlığıyla aynı: düz zemin, tek çizgi. */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight text-ink no-underline"
            translate="no"
          >
            {PRODUCT.name}
          </Link>

          <nav aria-label="Site menüsü" className="ml-2 hidden gap-4 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-ink-2 no-underline transition-colors duration-150 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/giris"
              className="hidden h-8 items-center rounded px-2.5 text-[13px] text-ink-2 no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-ink sm:inline-flex"
            >
              Giriş
            </Link>
            <Link
              href="/iletisim"
              className="inline-flex h-8 items-center rounded border border-accent bg-accent px-3 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
            >
              Demo isteyin
            </Link>
          </div>
        </div>
      </header>

      <main id="icerik" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div className="flex min-w-0 max-w-sm flex-col gap-1.5">
              <p className="text-[15px] font-semibold tracking-tight text-ink" translate="no">
                {PRODUCT.name}
              </p>
              <p className="text-[13px] text-ink-2">{PRODUCT.summary}</p>
              <p className="text-[12px] text-ink-3">{PRODUCT.stage}</p>
            </div>

            <nav aria-label="Alt menü" className="flex flex-col gap-1.5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Ürün</p>
              <Link href="/#urun" className="text-[13px] text-ink-2 no-underline hover:text-ink">
                Neler yapıyor
              </Link>
              <Link href="/fiyat" className="text-[13px] text-ink-2 no-underline hover:text-ink">
                Fiyat
              </Link>
              <Link href="/giris" className="text-[13px] text-ink-2 no-underline hover:text-ink">
                Giriş
              </Link>
            </nav>

            <nav aria-label="Hukuki" className="flex flex-col gap-1.5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Hukuki</p>
              <Link href="/kvkk" className="text-[13px] text-ink-2 no-underline hover:text-ink">
                Aydınlatma metni
              </Link>
              <Link href="/iletisim" className="text-[13px] text-ink-2 no-underline hover:text-ink">
                İletişim
              </Link>
            </nav>
          </div>

          <p className="border-t border-border pt-5 text-[12px] text-ink-3">
            Kayıtlar {SITE_CONTACT.dataRegion} bölgesindeki sunucularda tutulur. Bu site pazarlama
            ya da izleme çerezi kullanmaz.
          </p>
        </div>
      </footer>
    </div>
  );
}
