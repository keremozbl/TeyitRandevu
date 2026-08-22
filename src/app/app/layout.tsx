import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { NavLink } from "./nav-link";
import { SetupNotice } from "./setup-notice";

const NAV = [
  { href: "/app", label: "Takvim" },
  { href: "/app/hastalar", label: "Hastalar" },
  { href: "/app/hizmetler", label: "Hizmetler" },
  { href: "/app/ekip", label: "Ekip" },
  { href: "/app/raporlar", label: "Raporlar" },
  { href: "/app/ayarlar", label: "Ayarlar" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { active, memberships, user } = await requireTenant();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <div className="flex h-12 items-center gap-4 px-4">
          <Link
            href="/app"
            className="text-[15px] font-semibold tracking-tight text-ink no-underline"
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
            <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
              {active.role_key}
            </span>
            <span className="hidden min-w-0 max-w-[16rem] truncate text-[13px] text-ink-2 md:inline">
              {user.email}
            </span>
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

        <nav aria-label="Ana menü" className="flex gap-0.5 overflow-x-auto px-3">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
