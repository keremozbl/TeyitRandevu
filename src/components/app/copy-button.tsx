"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Panoya kopyalama düğmesi.
 *
 * İki şey bilinçli:
 *
 * **Geri bildirim `aria-live` ile duyuruluyor.** Kopyalama görsel olarak
 * hiçbir şey değiştirmez; ekran okuyucu kullanan biri düğmeye bastığında
 * bir şey olup olmadığını anlayamaz. Metnin kendisi değişiyor ve kibar
 * biçimde ("polite") duyuruluyor.
 *
 * **Başarısızlık sessiz geçilmiyor.** `navigator.clipboard` güvenli olmayan
 * bağlamda (http üzerinden ağdaki bir makineden açıldığında) yok; kurum
 * linki kopyaladığını sanıp boş yapıştırmasın diye durum söyleniyor.
 */
export function CopyButton({
  value,
  label = "Kopyala",
  /**
   * Ekran okuyucuya söylenecek ad. Aynı sayfada birden fazla kopyala
   * düğmesi varsa görünen yazı hepsinde aynı olabiliyor ("Bağlantıyı
   * kopyala"); düğme listesini gezen biri hangisinin hangisi olduğunu
   * ancak buradan anlıyor.
   */
  ariaLabel,
  className = "",
}: {
  value: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 2500);
  };

  const text =
    state === "copied" ? "Kopyalandı" : state === "failed" ? "Kopyalanamadı" : label;

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      data-control="sm"
      className={[
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded border px-2.5",
        "text-[13px] font-medium",
        "transition-[background-color,border-color,color] duration-150",
        state === "copied"
          ? "border-st-confirmed bg-st-confirmed-soft text-st-confirmed"
          : state === "failed"
            ? "border-st-noshow bg-st-noshow-soft text-st-noshow"
            : "border-border bg-surface text-ink hover:bg-surface-2 hover:border-border-strong",
        className,
      ].join(" ")}
    >
      <span aria-hidden="true" className="font-mono text-[11px]">
        {state === "copied" ? "✓" : state === "failed" ? "!" : "⧉"}
      </span>
      <span>{text}</span>
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Panoya kopyalandı"
          : state === "failed"
            ? "Kopyalanamadı, metni elle seçin"
            : ""}
      </span>
    </button>
  );
}
