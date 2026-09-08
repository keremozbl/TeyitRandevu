"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Raydaki tek satır.
 *
 * `<Link>`, `<div onClick>` değil: Cmd/Ctrl+tık ve orta tık yeni sekmede
 * açsın. Aktiflik `usePathname` ile — bu yüzden bileşen istemcide, ama
 * yalnızca bu satır; rayın geri kalanı sunucuda çiziliyor.
 *
 * Katlıyken etiket DOM'da kalıyor, sadece `sr-only`: ekran okuyucu bağlantının
 * adını okumaya devam eder. Fare kullanıcısı için `title` var.
 */
export function RailLink({
  href,
  label,
  collapsed,
  children,
}: {
  href: string;
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // "/app" her sayfanın öneki; takvim yalnızca birebir eşleşmede aktif.
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded border-l-2 py-1.5 text-[13px] no-underline transition-[background-color,border-color,color] duration-150 ${
        collapsed ? "justify-center px-0" : "px-2.5"
      } ${
        active
          ? "border-accent bg-surface-2 font-medium text-ink"
          : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
      <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{label}</span>
    </Link>
  );
}
