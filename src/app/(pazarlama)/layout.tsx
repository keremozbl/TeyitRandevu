import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { BTN_SMALL, Container, Wordmark } from "@/components/marketing/ui";
import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { PRODUCT } from "@/lib/marketing/content";

/**
 * Pazarlama sitesinin kabuğu.
 *
 * Panelden ayrı bir route grubu: `/app` yoğun bir operasyon aracı, burası
 * okunacak bir sayfa. Token'lar aynı, ölçek ve marka rengi farklı.
 *
 * Bu grupta Supabase'e hiç gidilmiyor — sayfalar statik üretiliyor ve
 * Frankfurt'a tur atmıyor. Tek istisna demo formu; o da bir server action.
 */

const NAV = [
  { href: "/#urun", label: "Ürün" },
  { href: "/fiyat", label: "Fiyat" },
  { href: "/#kvkk", label: "KVKK" },
  { href: "/iletisim", label: "İletişim" },
];

export default function PazarlamaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#icerik"
        className="sr-only rounded border border-border bg-surface px-3 py-2 text-[14px] text-ink focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-20"
      >
        İçeriğe geç
      </a>

      {/* Saydam + bulanık başlık bilerek yok: glassmorphism kaçınılanlar
          listesinde (globals.css) ve altından kayan ürün ızgarasını okunmaz
          yapıyor. Düz zemin, tek çizgi. */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <Container className="flex h-[60px] items-center gap-6">
          <Link href="/" className="no-underline" aria-label="TeyitRandevu ana sayfa">
            <Wordmark />
          </Link>

          <nav aria-label="Site menüsü" className="hidden gap-5 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[14px] text-ink-2 no-underline transition-colors duration-150 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/giris"
              className={`${BTN_SMALL} hidden text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex`}
            >
              Giriş
            </Link>
            <Link
              href="/iletisim"
              className={`${BTN_SMALL} border border-brand bg-brand text-brand-ink hover:border-brand-strong hover:bg-brand-strong`}
            >
              Demo isteyin
            </Link>
          </div>
        </Container>

        {/* Mobilde menü kaybolmasın: açılır panel yerine kayan tek sıra —
            JavaScript istemez, klavye ve ekran okuyucu için sorunsuz. */}
        <nav
          aria-label="Site menüsü (mobil)"
          className="flex gap-4 overflow-x-auto border-t border-border px-5 py-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 text-[14px] text-ink-2 no-underline hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="icerik" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-surface-2">
        <Container className="flex flex-col gap-8 py-12">
          <div className="flex flex-wrap gap-x-12 gap-y-8">
            <div className="flex min-w-0 max-w-sm flex-col gap-2">
              <Wordmark />
              <p className="text-[14px] leading-relaxed text-ink-2">{PRODUCT.summary}</p>
              <p className="text-[13px] text-ink-3">{PRODUCT.stage}</p>
            </div>

            <nav aria-label="Alt menü" className="flex flex-col gap-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">Ürün</p>
              <Link href="/#urun" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Neler yapıyor
              </Link>
              <Link href="/fiyat" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Fiyat
              </Link>
              <Link href="/giris" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Giriş
              </Link>
            </nav>

            <nav aria-label="Hukuki" className="flex flex-col gap-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">
                Hukuki
              </p>
              <Link href="/kvkk" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Aydınlatma metni
              </Link>
              <Link href="/iletisim" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                İletişim
              </Link>
            </nav>
          </div>

          <p className="border-t border-border pt-6 text-[13px] text-ink-3">
            Kayıtlar {SITE_CONTACT.dataRegion} bölgesindeki sunucularda tutulur. Bu site pazarlama
            ya da izleme çerezi kullanmaz.
          </p>
        </Container>
      </footer>
    </div>
  );
}
