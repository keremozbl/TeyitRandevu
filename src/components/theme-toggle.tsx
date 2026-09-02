"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { applyTheme, readTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Açık tema",
    icon: (
      <>
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.15 1.15M11.85 11.85 13 13M13 3l-1.15 1.15M4.15 11.85 3 13" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Koyu tema",
    icon: <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />,
  },
  {
    value: "system",
    label: "Sistem temasını kullan",
    icon: (
      <>
        <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" />
        <path d="M5.75 14h4.5" />
      </>
    ),
  },
];

/**
 * Açık / koyu / sistem anahtarı.
 *
 * Üç durum ayrı ayrı görünür — tek düğmeli "değiştir" anahtarı, kullanıcıya
 * hangi tercihte olduğunu değil yalnızca sonraki adımı söyler.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "light" : readTheme(),
  );

  // Geliştirme modunda Strict Mode remount'u <html>'in JSX dışı özniteliklerini
  // siliyor; betiğin yazdığı data-theme de gidiyor. Üretimde işlemsiz.
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);

  // "Sistem" seçiliyken renkleri CSS çeviriyor, ama tarayıcı çubuğunun rengini
  // bizim güncellememiz gerekiyor.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Depolama kapalıysa tercih bu sekmede yaşar, hata göstermeye değmez.
    }
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded border border-border bg-surface p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-label={option.label}
            aria-pressed={active}
            title={option.label}
            className={`inline-flex size-7 items-center justify-center rounded-sm transition-colors duration-150 ${
              active
                ? "bg-surface-2 text-ink"
                : "text-ink-3 hover:bg-surface-2 hover:text-ink-2"
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {option.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
