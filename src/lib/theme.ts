/**
 * Tema tercihi.
 *
 * Üç durum var: "light", "dark" ve "system". Varsayılan **açık** — işletim
 * sistemi koyu olsa bile ilk ziyarette site açık açılır; koyu tema bir tercih,
 * bir sürpriz değil. `globals.css` bunu zaten destekliyor: koyu blok
 * `:root:not([data-theme="light"])` ile korunuyor, `[data-theme="dark"]` de
 * her iki yönde kazanıyor.
 *
 * Tercih `localStorage`'da: cookie kök layout'ta okunsaydı tüm ağaç statik
 * ön üretimden çıkardı (Next: "Preventing flash before hydration").
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "tr-tema";

/** İşletim sistemi tercihine bırakıldığında `data-theme` hiç yazılmaz. */
export const THEME_DEFAULT: Theme = "light";

/** Tarayıcı çubuğunun rengi sayfanın zeminiyle aynı olmalı. */
export const THEME_COLOR = { light: "#F7F7F5", dark: "#0F1416" } as const;

/**
 * `<head>` içinde, HTML ayrıştırılırken senkron çalışır: ilk boyamadan önce
 * `data-theme` yerine oturur, tema geçişi göz kırpması olmaz. `useEffect`
 * hidrasyondan sonra çalıştığı için burada işe yaramaz.
 *
 * Aynı betik `data-js` de yazıyor: kaydırma animasyonlarının gizleme kuralı
 * ona bağlı, yani JavaScript çalışmayan tarayıcıda içerik gizlenmiyor.
 */
export const THEME_INIT_SCRIPT = `(function(){var r=document.documentElement;r.setAttribute("data-js","1");try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){r.setAttribute("data-theme",t)}else if(t==="system"){r.removeAttribute("data-theme")}}catch(e){}})()`;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/** "system" seçiliyken hangi temanın çizildiği — yalnızca tarayıcıda anlamlı. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** DOM'a uygular. Anahtar ve dev remount tamiri aynı yerden geçsin diye tek fonksiyon. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[resolveTheme(theme)]);
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : THEME_DEFAULT;
  } catch {
    return THEME_DEFAULT;
  }
}
