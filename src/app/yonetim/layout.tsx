import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/platform/queries";

/**
 * Platform yönetimi — TeyitRandevu'nun kendi ekranı, kiracıların değil.
 *
 * `/app` altında DEĞİL: oradaki her sayfa bir kurumun bağlamında çalışıyor ve
 * demo talepleri hiçbir kuruma ait değil. Kiracı panelinde gösterilseydi her
 * klinik sahibi diğerlerinin satış kaydını görürdü.
 *
 * Yetkisi olmayana 404: "burada bir yönetim ekranı var ama giremezsin" demenin
 * kimseye faydası yok.
 */
export default async function YonetimLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-4 px-4">
          <Link
            href="/yonetim/talepler"
            className="text-[15px] font-semibold tracking-tight text-ink no-underline"
          >
            Platform
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
            yönetim
          </span>
          <Link
            href="/app"
            className="ml-auto text-[13px] text-ink-2 no-underline hover:text-ink"
          >
            Panele dön
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
