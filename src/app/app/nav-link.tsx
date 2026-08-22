"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Gezinme için <Link>: Cmd/Ctrl+tık ve orta tık çalışsın diye. */
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] no-underline transition-[color,border-color] duration-150 ${
        active
          ? "border-accent text-ink"
          : "border-transparent text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
