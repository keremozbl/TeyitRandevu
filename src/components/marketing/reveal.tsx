"use client";

import { useEffect, useRef } from "react";

/**
 * Görünüme girdikçe beliren bölüm.
 *
 * Dört kural:
 *
 * 1. **JavaScript yoksa hiçbir şey gizlenmez.** Gizleme kuralı
 *    `:root[data-js]` altında (globals.css) ve o özniteliği `<head>`
 *    içindeki senkron betik yazıyor. Betik çalışmazsa sayfa olduğu gibi
 *    görünür — içeriği animasyona bağlamıyoruz.
 * 2. **Gözlemci çalışmıyorsa da gizlenmez.** `IntersectionObserver` geri
 *    çağrısı her ortamda gelmiyor (örtülmüş ya da arka planda duran pencerede
 *    hiç tetiklenmeyebiliyor — geliştirme sırasında bir tarayıcı bağlamında
 *    birebir bu görüldü). Bir "yoklama" gözlemcisi bunu ölçüyor; kısa sürede
 *    cevap gelmezse bütün bölümler açılıyor. Animasyonu kaybetmek, içeriği
 *    kaybetmekten iyidir.
 * 3. **React durumu yok.** Sınıf doğrudan DOM'a yazılıyor; her bölüm için
 *    yeniden render etmenin anlamı yok (ve `useEffect` içinde `setState`
 *    lint kuralına takılır).
 * 4. **Yalnızca `opacity` ve `transform`.** `prefers-reduced-motion` açıkken
 *    kural tamamen kapanıyor, öğe baştan görünür.
 */

/** Gözlemcisi henüz tetiklenmemiş bölümler — yoklama başarısız olursa açılırlar. */
const bekleyen = new Set<HTMLElement>();
let yoklama: "bilinmiyor" | "calisiyor" | "bozuk" = "bilinmiyor";

function ac(node: HTMLElement) {
  node.dataset.reveal = "acik";
  bekleyen.delete(node);
}

/**
 * Gözlemci geri çağrısı geliyor mu?
 *
 * Kök öğeyi gözlemleyip cevabı bekliyoruz; gelmezse ortamda bu API sessizce
 * çalışmıyor demektir ve gizli duran her şeyi açıyoruz.
 */
function yoklamaBaslat() {
  if (yoklama !== "bilinmiyor") return;

  const sayac = window.setTimeout(() => {
    if (yoklama !== "bilinmiyor") return;
    yoklama = "bozuk";
    for (const node of [...bekleyen]) ac(node);
  }, 1200);

  const gozlemci = new IntersectionObserver(() => {
    yoklama = "calisiyor";
    window.clearTimeout(sayac);
    gozlemci.disconnect();
  });

  gozlemci.observe(document.documentElement);
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Kademeli giriş için milisaniye */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article" | "section";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Gözlemci yoksa (çok eski tarayıcı) ya da bu ortamda çalışmadığı
    // ölçüldüyse içerik gizli kalmasın.
    if (typeof IntersectionObserver === "undefined" || yoklama === "bozuk") {
      ac(node);
      return;
    }

    bekleyen.add(node);
    yoklamaBaslat();

    // Eşik SIFIR olmak zorunda: oran tabanlı bir eşik (ör. 0.08), ekrandan
    // uzun bir bölümde HİÇ oluşmaz — öğenin görünen alanı kendi alanının
    // yüzde sekizini geçmez ve bölüm sonsuza kadar gizli kalırdı.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          ac(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(node);
    return () => {
      bekleyen.delete(node);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      // @ts-expect-error — ref türü Tag'e göre değişiyor, DOM için hepsi aynı
      ref={ref}
      data-reveal="kapali"
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}
