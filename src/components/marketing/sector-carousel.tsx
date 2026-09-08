"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import type { SectorSlide } from "@/lib/marketing/sectors";

/**
 * Sektör seçici.
 *
 * Sekme (tab) deseni. Geniş ekranda sekmeler bir HALKA üzerinde duruyor:
 * seçilen sektör tepedeki çapaya gelene kadar çember dönüyor, etiketler dik
 * kalsın diye kendi eksenlerinde ters dönüyor. Dar ekranda aynı sekmeler yatay
 * şerit olarak çiziliyor — çember orada dikey alanı yiyor ve etiketler
 * çakışıyor.
 *
 * Halka `display` ile değiştiği için ekran okuyucuda her zaman TEK bir tablist
 * var; iki ayrı `role="tab"` kümesi görünmüyor.
 *
 * Karusel otomatik DÖNMÜYOR — okuyan kişi metnin ortasında kendiliğinden dönen
 * bir çemberle yarışmak zorunda kalmasın (ve otomatik oynatma, Web Interface
 * Guidelines'ın durdurma denetimi istediği yerdir). Hareket kullanıcının
 * tıklamasından doğuyor; dönüş yalnızca `transform`, `prefers-reduced-motion`
 * globals.css'te süreyi zaten sıfırlıyor.
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

/** Halkanın yarıçapı (px) ve dönüş süresi. Çember 360° / sektör sayısı. */
const RING_R = 122;
const RING_MS = 600;

/**
 * Halkadaki kısa ad: "Güzellik & Bakım Salonu" çemberde komşusuna değiyor.
 * Tam ad halkanın ortasında ve panelde zaten yazıyor.
 */
function shortLabel(label: string): string {
  return label.split(/[&/]/)[0].trim();
}

/**
 * İki sektör arasındaki EN KISA yön (işaretli adım sayısı).
 *
 * Halkanın açısı sürekli bir sayı olarak tutuluyor, 0-360 arasına
 * sıkıştırılmıyor: sonuncudan ilkine geçerken açı sıfıra "sarsaydı" çember
 * ters yöne neredeyse tam tur atardı.
 */
function shortestStep(from: number, to: number, count: number): number {
  const forward = (((to - from) % count) + count) % count;
  return forward > count / 2 ? forward - count : forward;
}

export function SectorCarousel({ slides }: { slides: SectorSlide[] }) {
  const step = 360 / slides.length;
  const [picked, setPicked] = useState<{ index: number; angle: number } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const urlKey = useSyncExternalStore(
    subscribeToUrl,
    readSectorFromUrl,
    () => null, // sunucu: adres çubuğu yok
  );

  const fromUrl = slides.findIndex((slide) => slide.key === urlKey);
  const index = picked?.index ?? (fromUrl >= 0 ? fromUrl : 0);
  // Adres çubuğundan gelen seçim (geri tuşu) dönmeden yerine oturur.
  const angle = picked?.angle ?? -index * step;
  const chosen = slides[index];

  function select(next: number, focusTab = false) {
    const clamped = (next + slides.length) % slides.length;
    setPicked({
      index: clamped,
      angle: angle - shortestStep(index, clamped, slides.length) * step,
    });

    const url = new URL(window.location.href);
    url.searchParams.set("sektor", slides[clamped].key);
    url.hash = "sektorler";
    window.history.replaceState(null, "", url);

    // Şerit dar ekranda; halkada kaydırılacak bir şey yok. `getElementById`
    // çünkü iki yerleşimden hangisinin çizildiğini CSS belirliyor.
    tabsRef.current
      ?.querySelector<HTMLButtonElement>(`#sektor-tab-${clamped}`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });

    if (!focusTab) return;
    // İki yerleşimden hangisinin çizildiğini CSS belirliyor; görünür olana
    // odaklan. `offsetParent` null ise öğe `display: none` demektir.
    for (const id of [`sektor-halka-${clamped}`, `sektor-tab-${clamped}`]) {
      const tab = document.getElementById(id) as HTMLButtonElement | null;
      if (tab && tab.offsetParent !== null) {
        tab.focus();
        return;
      }
    }
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
      {/* --- dar ekran: yatay şerit --- */}
      <div className="flex items-center gap-3 sm:hidden">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Sektörler"
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, position) => (
            <button
              key={slide.key}
              id={`sektor-tab-${position}`}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-controls="sektor-panel"
              tabIndex={position === index ? 0 : -1}
              onClick={() => select(position)}
              className={`shrink-0 rounded border px-3.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
                position === index
                  ? "border-brand bg-brand text-brand-ink"
                  : "border-border bg-surface text-ink-2"
              }`}
            >
              {slide.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- geniş ekran: dönen halka --- */}
      <div className="hidden flex-col items-center gap-5 sm:flex">
        <div
          role="tablist"
          aria-label="Sektörler"
          onKeyDown={onKeyDown}
          className="relative size-[19rem] shrink-0 lg:size-[21rem]"
        >
          {/* Yörünge çizgisi: çemberin nerede olduğu görünsün, dekor değil */}
          <span
            aria-hidden="true"
            className="absolute inset-6 rounded-full border border-dashed border-border"
          />

          {/* Tepedeki çapa — seçilenin geleceği yer */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-3 size-1.5 -translate-x-1/2 rounded-full bg-brand"
          />

          {/* Ortada tam ad; sektör değişince çapraz sönümlenir */}
          <div className="absolute inset-0 flex items-center justify-center px-16">
            <div key={chosen.key} className="animate-[sektor-giris_220ms_ease-out] text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {chosen.familyLabel}
              </p>
              <p className="text-pretty pt-1 text-[15px] font-semibold leading-tight text-ink">
                {chosen.label}
              </p>
            </div>
          </div>

          {/* Dönen kap. Sekmeler bunun içinde SABİT duruyor; dönen şey halka.
              Her sekme kendi ekseninde `-(angle + kendi açısı)` kadar ters
              dönerek dik kalıyor — yoksa etiketler yan yatardı. */}
          <div
            className="absolute inset-0 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-safe:transition-transform"
            style={{ transform: `rotate(${angle}deg)`, transitionDuration: `${RING_MS}ms` }}
          >
            {slides.map((slide, position) => {
              const active = position === index;
              return (
                <button
                  key={slide.key}
                  id={`sektor-halka-${position}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="sektor-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(position)}
                  style={{
                    transform:
                      `translate(-50%, -50%) rotate(${position * step}deg) ` +
                      `translateY(-${RING_R}px) rotate(${-(angle + position * step)}deg)`,
                    transitionDuration: `${RING_MS}ms`,
                  }}
                  className={`absolute left-1/2 top-1/2 w-[7.5rem] rounded border px-2 py-1.5 text-[13px] font-medium ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-safe:transition-[transform,background-color,border-color,color] ${
                    active
                      ? "border-brand bg-brand text-brand-ink"
                      : "border-border bg-surface text-ink-2 [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:text-ink"
                  }`}
                >
                  <span className="block truncate">{shortLabel(slide.label)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
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
