"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import type { SectorSlide } from "@/lib/marketing/sectors";

/**
 * Sektör seçici.
 *
 * Sekme (tab) deseni: şerit yatay kayar, ok tuşları çalışır, seçili sekme
 * görünüme kaydırılır. Karusel otomatik dönmüyor — okuyan kişi metnin ortasında
 * kayan bir panelle yarışmak zorunda kalmasın (ve otomatik oynatma, Web
 * Interface Guidelines'ın durdurma denetimi istediği yerdir).
 *
 * Geçiş `key` ile tetiklenen bir animasyon: yalnızca `opacity` ve `transform`,
 * `prefers-reduced-motion` globals.css'te zaten kapatıyor.
 *
 * Seçim adres çubuğuna `?sektor=` olarak yazılıyor ama `router.replace` ile
 * DEĞİL: bu sayfa statik üretiliyor ve her seçimde sunucuya tur attırmanın
 * anlamı yok. `history.replaceState` bağlantıyı paylaşılabilir yapar, sayfayı
 * dinamiğe çevirmez.
 *
 * Adres çubuğu bir dış kaynak olduğu için `useSyncExternalStore` ile okunuyor:
 * `useEffect` içinde `setState` çağırmak zincirleme render üretir ve lint
 * kuralı (react-hooks/set-state-in-effect) haklı olarak buna izin vermiyor.
 * Sunucu anlık görüntüsü `null` döndüğü için ilk HTML her zaman ilk sektörle
 * çiziliyor; hidrasyon uyuşmazlığı olmuyor.
 */

function subscribeToUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readSectorFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("sektor");
}

const TONES = {
  confirmed: "border-l-st-confirmed bg-st-confirmed-soft",
  pending: "border-l-st-pending bg-st-pending-soft",
  arrived: "border-l-st-arrived bg-st-arrived-soft",
} as const;

const ROW_H = 2.5; // rem — önizleme ızgarasında yarım saat

export function SectorCarousel({ slides }: { slides: SectorSlide[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const urlKey = useSyncExternalStore(
    subscribeToUrl,
    readSectorFromUrl,
    () => null, // sunucu: adres çubuğu yok
  );

  const fromUrl = slides.findIndex((slide) => slide.key === urlKey);
  const index = picked ?? (fromUrl >= 0 ? fromUrl : 0);
  const chosen = slides[index];

  function select(next: number, focusTab = false) {
    const clamped = (next + slides.length) % slides.length;
    setPicked(clamped);

    const url = new URL(window.location.href);
    url.searchParams.set("sektor", slides[clamped].key);
    url.hash = "sektorler";
    window.history.replaceState(null, "", url);

    const tab = tabsRef.current?.querySelector<HTMLButtonElement>(`#sektor-tab-${clamped}`);
    tab?.scrollIntoView({ block: "nearest", inline: "center" });
    if (focusTab) tab?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") select(index + 1, true);
    else if (event.key === "ArrowLeft") select(index - 1, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(slides.length - 1, true);
    else return;
    event.preventDefault();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Sektörler"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, position) => {
            const active = position === index;
            return (
              <button
                key={slide.key}
                id={`sektor-tab-${position}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="sektor-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => select(position)}
                className={`shrink-0 rounded border px-3.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
                  active
                    ? "border-brand bg-brand text-brand-ink"
                    : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink"
                }`}
              >
                {slide.label}
              </button>
            );
          })}
        </div>

        {/* Ok düğmeleri şeridin dışında: dokunmatikte parmakla kaydırma zaten
            var, klavye ve fare için de bir yol olsun. */}
        <div className="hidden shrink-0 gap-1 sm:flex">
          <button
            type="button"
            onClick={() => select(index - 1)}
            aria-label="Önceki sektör"
            className="inline-flex size-9 items-center justify-center rounded border border-border bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            onClick={() => select(index + 1)}
            aria-label="Sonraki sektör"
            className="inline-flex size-9 items-center justify-center rounded border border-border bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>

      <div
        id="sektor-panel"
        role="tabpanel"
        aria-labelledby={`sektor-tab-${index}`}
        tabIndex={0}
        className="rounded-lg border border-border bg-surface p-5 sm:p-7"
      >
        {/* key: sektör değiştiğinde giriş animasyonu yeniden çalışsın */}
        <div
          key={chosen.key}
          className="grid animate-[sektor-giris_220ms_ease-out] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12"
        >
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                {chosen.familyLabel}
              </p>
              <h3 className="text-[22px] font-semibold tracking-tight text-ink">{chosen.label}</h3>
              <p className="text-[15px] leading-relaxed text-ink-2">{chosen.description}</p>
            </div>

            <dl className="grid grid-cols-3 gap-4 border-y border-border py-4">
              <Term label="Kayıtlar" value={chosen.terms.customer} />
              <Term label="Kaynaklar" value={chosen.terms.resource} />
              <Term label={chosen.terms.service} value={`${chosen.serviceCount} hazır`} />
            </dl>

            <div className="flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                Kurulumda gelen {chosen.terms.service.toLocaleLowerCase("tr-TR")}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {chosen.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-baseline gap-1.5 rounded border border-border bg-surface-2 px-2 py-1 text-[13px] text-ink"
                  >
                    <span className="min-w-0 truncate">{service.name}</span>
                    <span data-numeric className="font-mono text-[11px] text-ink-3">
                      {service.duration}dk
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {chosen.note && (
              <p className="border-l-2 border-brand-line pl-3 text-[13px] leading-relaxed text-ink-3">
                {chosen.note}
              </p>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/demo?sektor=${chosen.key}`}
                className="inline-flex h-10 items-center justify-center rounded border border-brand bg-brand px-4 text-[14px] font-medium text-brand-ink no-underline transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong"
              >
                Bu sektörle demoyu başlat
              </Link>
              <span data-numeric className="text-[13px] text-ink-3">
                {chosen.fieldCount} sektöre özel alan
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {/* Fotoğraf sektörü bir bakışta anlatıyor; ürünün kendisi hemen
                altında duruyor ki fotoğraf iddiayı değil ortamı taşısın. */}
            <div className="relative aspect-[16/9] overflow-hidden rounded border border-border">
              <Image
                src={chosen.photo.src}
                alt={chosen.photo.alt}
                fill
                sizes="(min-width: 1024px) 26rem, 100vw"
                className="object-cover"
              />
            </div>
            <DayPreview slide={chosen} />
            {chosen.reminder && (
              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="pb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                  Hatırlatma metni
                </p>
                <p className="text-[13px] leading-relaxed text-ink">{chosen.reminder}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
        {label}
      </dt>
      <dd className="truncate text-[15px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Sektörün kendi hizmetleriyle çizilmiş yarım günlük takvim. */
function DayPreview({ slide }: { slide: SectorSlide }) {
  const columns = slide.columns.length > 0 ? slide.columns : ["Uzman 1"];

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
          Bugün · Merkez
        </span>
      </div>

      <div
        className="grid text-[12px]"
        style={{ gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-border" />
        {columns.map((column) => (
          <div
            key={column}
            className="min-w-0 truncate border-b border-l border-border px-2 py-1.5 font-medium text-ink"
          >
            {column}
          </div>
        ))}

        <div className="flex flex-col">
          {slide.rows.map((row) => (
            <div
              key={row}
              className="border-b border-border px-2 pt-0.5 text-right font-mono text-[11px] text-ink-3"
              style={{ height: `${ROW_H}rem` }}
            >
              {row}
            </div>
          ))}
        </div>

        {columns.map((column, columnIndex) => (
          <div key={column} className="relative border-l border-border">
            {slide.rows.map((row) => (
              <div key={row} className="border-b border-border" style={{ height: `${ROW_H}rem` }} />
            ))}
            {slide.blocks
              .filter((block) => block.column === columnIndex)
              .map((block) => (
                <div
                  key={`${block.service}-${block.row}`}
                  className={`absolute inset-x-1 overflow-hidden rounded-sm border-l-2 px-1.5 py-1 ${TONES[block.tone]}`}
                  style={{
                    top: `${block.row * ROW_H + 0.15}rem`,
                    height: `${block.span * ROW_H - 0.3}rem`,
                  }}
                >
                  <p className="truncate text-[12px] font-medium text-ink">{block.service}</p>
                  <p className="truncate text-[11px] text-ink-2">{block.who}</p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}
