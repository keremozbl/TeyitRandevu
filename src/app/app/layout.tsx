import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { requireTenant } from "@/lib/auth/session";
import { DEMO_TENANT_SLUG, isDemoUser } from "@/lib/demo/config";
import { readRail } from "@/lib/panel/rail";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { CommandSearch } from "./command-search";
import { navFlat } from "./nav-items";
import { NavLink } from "./nav-link";
import { SetupNotice } from "./setup-notice";
import { SideNav } from "./side-nav";

/**
 * Panel kabuğu.
 *
 * Yerleşim iki sütun: solda ray (yalnızca masaüstü), sağda içerik. İkisi de
 * kendi içinde kayıyor ve başlık kaydırma kabının dışında — bu yüzden başlığın
 * `sticky` olmasına gerek yok ve yüksekliğini kimsenin hesaplaması gerekmiyor.
 * Takvimde kazandığımız şey bu: menü artık başlığın altında bir satır yemiyor.
 *
 * Yazdırmada kabuk tamamen çözülüyor: program çıktısı gerçekten kullanılıyor
 * (Plan 8.3) ve sabit yükseklikli bir kap kâğıtta tek sayfaya sıkışırdı.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { active, memberships, user } = await requireTenant();
  const isDemo = isDemoUser(user) || active.tenant.slug === DEMO_TENANT_SLUG;
  const rail = await readRail();

  const { customer_plural: customers, customer_singular: customer, service_plural: services } =
    active.terms;

  return (
    <div className="flex h-dvh flex-col print:block print:h-auto">
      <header className="shrink-0 border-b border-border bg-bg print:hidden">
        <div className="flex h-12 items-center gap-4 px-4">
          <Link
            href="/app"
            className="shrink-0 text-[15px] font-semibold tracking-tight text-ink no-underline"
            translate="no"
          >
            TeyitRandevu
          </Link>

          <span className="text-ink-3" aria-hidden="true">
            /
          </span>

          <span className="min-w-0 truncate text-ink-2">
            {active.tenant.name}
            {memberships.length > 1 && (
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">
                +{memberships.length - 1}
              </span>
            )}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <CommandSearch
              customers={customers}
              services={services}
              customersLabel={customer}
            />
            <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
              {active.role_key}
            </span>
            <span className="hidden min-w-0 max-w-[16rem] truncate text-[13px] text-ink-2 md:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <form action="/auth/cikis" method="post">
              <button
                type="submit"
                className="rounded px-2 py-1 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              >
                Çıkış
              </button>
            </form>
          </div>
        </div>

        {/* Vitrin kurumu herkese açık: ziyaretçi buraya gerçek hasta bilgisi
            yazmasın diye uyarı gizlenebilir bir yerde değil, başlığın altında
            sabit duruyor. */}
        {isDemo && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-st-pending bg-st-pending-soft px-4 py-1.5 text-[13px] text-st-pending">
            <strong className="font-medium">Demo kurumu.</strong>
            <span>
              Gördüğünüz her şey örnek veridir; gerçek kişi bilgisi girmeyin. Bu kurum bir gün
              sonra silinir.
            </span>
            <Link href="/iletisim" className="underline underline-offset-2">
              Kendi kurumunuz için demo isteyin
            </Link>
          </p>
        )}

        {/* Mobilde ray yok: kayan tek sıra kalıyor — JavaScript istemez,
            çekmece açmak gerekmez, klavye ve ekran okuyucu için sorunsuz. */}
        <nav aria-label="Ana menü" className="flex gap-0.5 overflow-x-auto px-3 lg:hidden">
          {navFlat(customers, services).map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 print:block">
        <SideNav rail={rail} customers={customers} services={services} />
        <main className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
