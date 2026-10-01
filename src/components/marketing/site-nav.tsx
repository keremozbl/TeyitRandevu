"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Tek sayfa menüsü.
 *
 * Site tek sayfaya indiğinden menüdeki her bağlantı bir bölüm kancası. Kayma
 * animasyonunu CSS yapıyor (`html { scroll-behavior: smooth }`), burada
 * yapılan tek şey HANGİ bölümde olunduğunu göstermek: uzun bir sayfada
 * okuyanın nerede olduğunu bilmesi gerekiyor, yoksa menü altı ayrı sayfa gibi
 * görünüp hiçbirini işaretlemez.
 *
 * Gözlemci AÇIK BAŞARISIZ olur: hiç geri çağrı gelmezse yalnızca işaret
 * görünmez, gezinme çalışmaya devam eder. (Bkz. `reveal.tsx` — bu projede
 * IntersectionObserver'ın bazı tarayıcı bağlamlarında hiç tetiklenmediği
 * görüldü, o yüzden hiçbir şey ona bağlanmıyor.)
 *
 * Kancalar yalnızca ana sayfada var; başka bir sayfadayken (`/kvkk`)
 * bağlantılar `/#bolum` olarak yazılıyor ki önce ana sayfaya gidilsin.
 */

const NAV = [
  { id: "urun", label: "Ürün" },
  { id: "sektorler", label: "Sektörler" },
  { id: "fiyat", label: "Fiyat" },
  { id: "demo", label: "Canlı demo" },
  { id: "kvkk", label: "KVKK" },
  { id: "iletisim", label: "İletişim" },
];

function useActiveSection(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;

    const sections = NAV.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    // Görünür olanlardan EN ÜSTTEKİ seçiliyor. Bir bölüm ekrandan uzun
    // olduğunda kesişim oranı hiç yükselmez; oran yerine konuma bakmak o
    // durumda da doğru cevabı verir.
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = NAV.find((item) => visible.has(item.id));
        setActive(first?.id ?? null);
      },
      // Üstte yapışkan başlık kadar pay: başlığın altında kalan bir bölüm
      // "görünür" sayılmasın.
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [enabled]);

  return active;
}

export function SiteNav({ variant }: { variant: "masaustu" | "mobil" }) {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const active = useActiveSection(onHome);

  const masaustu = variant === "masaustu";

  return (
    <nav
      aria-label={masaustu ? "Site menüsü" : "Site menüsü (mobil)"}
      className={
        masaustu
          ? "hidden gap-5 md:flex"
          : "flex gap-4 overflow-x-auto border-t border-border px-5 py-2 md:hidden"
      }
    >
      {NAV.map((item) => {
        const current = onHome && active === item.id;
        return (
          <Link
            key={item.id}
            href={onHome ? `#${item.id}` : `/#${item.id}`}
            aria-current={current ? "true" : undefined}
            className={`group relative shrink-0 text-[14px] no-underline transition-colors duration-150 ${
              current ? "text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {item.label}
            {/* İşaret yalnızca transform ile açılıp kapanıyor; küresel
                prefers-reduced-motion bloğu süreyi zaten sıfırlıyor. */}
            <span
              aria-hidden="true"
              className={`absolute -bottom-1 left-0 h-0.5 w-full origin-left rounded-full bg-brand transition-transform duration-200 ease-out ${
                current ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
