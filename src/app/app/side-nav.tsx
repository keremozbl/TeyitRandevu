import { toggleRailAction } from "@/lib/panel/rail-actions";
import type { RailState } from "@/lib/panel/rail";

import { Icon, navGroups, settingsItem } from "./nav-items";
import { RailLink } from "./rail-link";

/**
 * Masaüstü kenar çubuğu.
 *
 * Neden yatay şeritten buraya taşındı: takvimde en kıymetli kaynak dikey
 * alan. Yedi sekmelik şerit başlığın altında bir satır daha yiyordu; ray o
 * satırı geri veriyor ve menüyü gruplayabiliyor.
 *
 * Bunun bedeli yatay alan, ve gün ızgarası kaynak sayısı arttıkça yatay
 * istiyor — bu yüzden ray katlanabilir ve tercih cookie'de duruyor. Mobilde
 * ray hiç çizilmiyor; orada başlıktaki kayan şerit kalıyor (JavaScript
 * istemiyor, çekmece açmak gerekmiyor).
 */
export function SideNav({
  rail,
  customers,
  services,
}: {
  rail: RailState;
  customers: string;
  services: string;
}) {
  const collapsed = rail === "kapali";
  const groups = navGroups(customers, services);
  const settings = settingsItem();

  return (
    <aside
      // Genişlik geçişi `width` üzerinden değil: layout animasyonu pahalı ve
      // katlama nadir bir eylem. Anlık geçiş burada doğru davranış.
      className={`hidden shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-bg py-3 lg:flex print:hidden ${
        collapsed ? "w-[52px] px-1.5" : "w-[200px] px-2"
      }`}
    >
      <nav aria-label="Ana menü" className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.caption} className="flex flex-col gap-0.5">
            {/* Katlıyken başlık gizli ama grup hâlâ adlandırılmış olmalı */}
            <p
              className={`px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 ${
                collapsed ? "sr-only" : ""
              }`}
              id={`grup-${group.caption}`}
            >
              {group.caption}
            </p>
            <ul aria-labelledby={`grup-${group.caption}`} className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href} className="min-w-0">
                  <RailLink href={item.href} label={item.label} collapsed={collapsed}>
                    <Icon>{item.icon}</Icon>
                  </RailLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-2">
        <RailLink href={settings.href} label={settings.label} collapsed={collapsed}>
          <Icon>{settings.icon}</Icon>
        </RailLink>

        {/* Form: JavaScript kapalıyken de tercih kaydedilsin */}
        <form action={toggleRailAction}>
          <button
            type="submit"
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü katla"}
            title={collapsed ? "Menüyü genişlet" : "Menüyü katla"}
            className={`flex w-full items-center gap-2.5 rounded py-1.5 text-[13px] text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink ${
              collapsed ? "justify-center px-0" : "px-2.5"
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} />
            </svg>
            <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>Menüyü katla</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
