import Link from "next/link";

import { LogoMark } from "@/components/logo-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink no-underline"
            aria-label="TeyitRandevu ana sayfa"
          >
            <LogoMark className="size-5" />
            TeyitRandevu
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
