"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { SectorSlide } from "@/lib/marketing/sectors";

import { SectorIllustration } from "./sector-illustration";

/**
 * Sektör seçici — sürüklenen çark.
 *
 * Geniş ekranda sektörler ekranın sağ kenarından TAŞAN büyük bir çemberin
 * üstünde duruyor; seçili olan çemberin sol ucundaki çapada, yani metnin hemen
 * yanında. Fareyle tutup çevirirsin, bıraktığında atalet devam eder, yavaşlar
 * ve en yakın sektöre oturur. Dar ekranda çember dikey alanı yiyip etiketleri
 * çakıştırdığı için aynı sekmeler yatay şerit olarak çiziliyor.
 *
 * Üç şey bilerek böyle:
 *
 * 1. **Açı SÜREKLİ bir sayı, 0-360'a sıkıştırılmıyor.** Sondan başa geçerken
 *    açıyı sarmak çemberi ters yöne neredeyse tam tur döndürüyordu.
 *
 * 2. **Sürükleme sırasında React render edilmiyor.** Her karede altı chip'in
 *    `transform`'u doğrudan DOM'a yazılıyor; state yalnızca seçili sektör
 *    DEĞİŞTİĞİNDE güncelleniyor. Kare başına render, sürüklemeyi takılmalı
 *    yapıyordu.
 *
 * 3. **Sayfa kaydırması çalınmıyor.** Tekerlek yalnızca YATAY (trackpad)
 *    hareketini çeviriyor; dikey tekerlek sayfayı kaydırmaya devam eder.
 *    Çemberin üstünde imleçle sayfayı kaydıramamak, kazanılan her şeyden
 *    daha can sıkıcı olurdu.
 *
 * Sürükleme bir ZENGİNLEŞTİRME: sekmeye tıklamak, ok tuşları, Home/End ve
 * ileri/geri düğmeleri aynı işi yapıyor (Web Interface Guidelines: jest
 * gerektiren her eylemin tıklama ve klavye karşılığı olmalı).
 *
 * Seçim adres çubuğuna `?sektor=` olarak yazılıyor ama `router.replace` ile
 * DEĞİL: bu sayfa statik üretiliyor ve her seçimde sunucuya tur attırmanın
 * anlamı yok. `history.replaceState` bağlantıyı paylaşılabilir yapar, sayfayı
 * dinamiğe çevirmez. Aynı parametreyi aşağıdaki demo bölümü de okuyor.
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

/** Çapa çemberin SOL ucunda: seçili sektör metnin yanında dursun. */
const ANCHOR = 180;
/** Atalet eşiği (derece/ms) — altına inince oturma tween'i başlar. */
const STOP = 0.02;
const SNAP_MS = 420;

/** Bir açıyı (-180, 180] aralığına indirger — sürüklerken sarmayı çözer. */
function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Kısa ad: "Güzellik & Bakım Salonu" çemberde komşusuna değiyor.
 * Tam ad çapanın yanındaki panelde zaten yazıyor.
 */
function shortLabel(label: string): string {
  return label.split(/[&/]/)[0].trim();
}

export function SectorCarousel({ slides }: { slides: SectorSlide[] }) {
  const count = slides.length;
  const step = 360 / count;

  const urlKey = useSyncExternalStore(subscribeToUrl, readSectorFromUrl, () => null);
  const fromUrl = slides.findIndex((slide) => slide.key === urlKey);

  /**
   * Seçili sektör TÜRETİLİR: kullanıcı henüz çarka dokunmadıysa adres
   * çubuğundaki `?sektor=`, dokunduysa `picked`.
   *
   * Doğrudan `setIndex` tutup effect içinde adresle eşitlemek zincirleme
   * render üretiyor ve `react-hooks/set-state-in-effect` haklı olarak buna
   * izin vermiyor. Geri tuşu `picked`'i temizliyor — ama effect GÖVDESİNDE
   * değil, popstate GERİ ÇAĞRISINDA; kuralın izin verdiği yer orası.
   */
  const [picked, setPicked] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const index = picked ?? (fromUrl >= 0 ? fromUrl : 0);

  const ringRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);

  /** Çemberin o anki açısı (sürekli derece). Render'a girmiyor. */
  const angleRef = useRef(ANCHOR);
  const rafRef = useRef(0);
  /** Sürükleme durumu — hepsi ref, çünkü karede state yazılmıyor. */
  const drag = useRef({ active: false, cx: 0, cy: 0, last: 0, v: 0, t: 0 });

  const targetFor = useCallback((i: number) => ANCHOR - i * step, [step]);

  const nearestIndex = useCallback(
    (angle: number) => (((Math.round((ANCHOR - angle) / step) % count) + count) % count),
    [count, step],
  );

  /** Altı chip'i açıya göre yerleştirir. Etiketler dik kalsın diye her chip
      kendi ekseninde `-(açı)` kadar ters dönüyor. */
  const place = useCallback(
    (angle: number) => {
      for (let i = 0; i < count; i++) {
        const chip = chipsRef.current[i];
        if (!chip) continue;
        const own = angle + i * step;
        chip.style.transform =
          `translate(-50%, -50%) rotate(${own}deg) translateX(var(--halka-r)) rotate(${-own}deg)`;
      }
      const hub = ringRef.current;
      if (hub) hub.style.setProperty("--halka-aci", `${angle}deg`);
    },
    [count, step],
  );

  /** Açıyı yaz, gerekiyorsa seçili sektörü de güncelle (panel takip etsin). */
  const apply = useCallback(
    (angle: number) => {
      angleRef.current = angle;
      place(angle);
      const next = nearestIndex(angle);
      setPicked((current) => (current === next ? current : next));
    },
    [nearestIndex, place],
  );

  const writeUrl = useCallback((key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("sektor", key);
    window.history.replaceState(null, "", url);
  }, []);

  const reduced = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  /** En yakın sektöre yumuşak oturma. */
  const snap = useCallback(
    (from: number) => {
      const i = nearestIndex(from);
      // Hedef, açının BULUNDUĞU tura en yakın olan: tam tur atmasın.
      const to = targetFor(i) + Math.round((from - targetFor(i)) / 360) * 360;

      if (reduced() || Math.abs(to - from) < 0.01) {
        apply(to);
        writeUrl(slides[i].key);
        return;
      }

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / SNAP_MS);
        apply(from + (to - from) * easeOutCubic(t));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else writeUrl(slides[i].key);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [apply, nearestIndex, reduced, slides, targetFor, writeUrl],
  );

  /** Bırakıldıktan sonraki serbest dönüş. */
  const coast = useCallback(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const v = drag.current.v;
      apply(angleRef.current + v * dt);
      // Üssel sönüm. Kareden BAĞIMSIZ olsun diye dt'ye göre üs alınıyor;
      // sabit bir çarpan, 60 Hz ile 120 Hz ekranda farklı mesafe verirdi.
      // Taban 0.05: sert bir savurma ~1 saniyede iki sektör kadar yol alıp
      // duruyor. Daha hızlı sönümde çark "tutuk", daha yavaşta savruk.
      drag.current.v = v * Math.pow(0.05, dt / 1000);
      if (Math.abs(drag.current.v) > STOP) rafRef.current = requestAnimationFrame(tick);
      else snap(angleRef.current);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [apply, snap]);

  /** Bir sektörü doğrudan seç (tıklama, klavye, ileri/geri). */
  const select = useCallback(
    (next: number, focusTab = false) => {
      cancelAnimationFrame(rafRef.current);
      const i = ((next % count) + count) % count;
      const from = angleRef.current;
      const to = targetFor(i) + Math.round((from - targetFor(i)) / 360) * 360;

      if (reduced()) {
        apply(to);
        writeUrl(slides[i].key);
      } else {
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / SNAP_MS);
          apply(from + (to - from) * easeOutCubic(t));
          if (t < 1) rafRef.current = requestAnimationFrame(tick);
          else writeUrl(slides[i].key);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      stripRef.current
        ?.querySelector<HTMLButtonElement>(`#sektor-tab-${i}`)
        ?.scrollIntoView({ block: "nearest", inline: "center" });

      if (!focusTab) return;
      for (const id of [`sektor-halka-${i}`, `sektor-tab-${i}`]) {
        const tab = document.getElementById(id) as HTMLButtonElement | null;
        if (tab && tab.offsetParent !== null) {
          tab.focus();
          return;
        }
      }
    },
    [apply, count, reduced, slides, targetFor, writeUrl],
  );

  /* İlk yerleşim + adres çubuğundan gelen seçim (paylaşılan bağlantı, geri
     tuşu). Dönmeden yerine oturur: kullanıcı sayfaya yeni geldi.
     Kendi yazdığımız `replaceState` popstate üretmediği için bu effect
     sürükleme sırasında yeniden çalışmıyor. */
  useEffect(() => {
    angleRef.current = targetFor(fromUrl >= 0 ? fromUrl : 0);
    place(angleRef.current);
  }, [fromUrl, place, targetFor]);

  /* Geri tuşu: elle yapılan seçim düşsün, adres çubuğu yeniden söz sahibi olsun. */
  useEffect(() => {
    const onPop = () => setPicked(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* --- sürükleme --- */

  function pointerAngle(event: { clientX: number; clientY: number }): number {
    const { cx, cy } = drag.current;
    return (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Chip'e tıklamak seçim yapar; sürükleme ancak parmak gerçekten
    // hareket ederse devreye girer (aşağıda eşik var).
    cancelAnimationFrame(rafRef.current);
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = {
      active: true,
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
      last: 0,
      v: 0,
      t: performance.now(),
    };
    drag.current.last = pointerAngle(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const now = performance.now();
    const current = pointerAngle(event);
    const delta = wrap180(current - drag.current.last);
    drag.current.last = current;

    const dt = Math.max(1, now - drag.current.t);
    drag.current.t = now;
    // Anlık hızı yumuşat: tek bir sıçrayan örnek ataleti fırlatıyordu.
    drag.current.v = drag.current.v * 0.6 + (delta / dt) * 0.4;

    if (!dragging && Math.abs(delta) > 0.4) setDragging(true);
    apply(angleRef.current + delta);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (reduced() || Math.abs(drag.current.v) <= STOP) snap(angleRef.current);
    else coast();
  }

  /** Trackpad'de yatay kaydırma çevirir; DİKEY tekerlek sayfayı kaydırmaya
      devam eder — sayfa kaydırmasını çalmak için hiçbir sebep yok. */
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;

    let idle = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      cancelAnimationFrame(rafRef.current);
      apply(angleRef.current - event.deltaX * 0.35);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => snap(angleRef.current), 140);
    };

    ring.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ring.removeEventListener("wheel", onWheel);
      window.clearTimeout(idle);
    };
  }, [apply, snap]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") select(index + 1, true);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") select(index - 1, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(count - 1, true);
    else return;
    event.preventDefault();
  }

  const chosen = slides[index];

  return (
    <div className="flex flex-col gap-8">
      {/* --- dar ekran: yatay şerit (çember burada etiketleri çakıştırıyor) --- */}
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Sektörler"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

      {/* --- geniş ekran: sağ kenardan taşan çark --- */}
      <div className="hidden gap-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex min-w-0 flex-col justify-center gap-5">
          <div key={chosen.key} className="flex animate-[sektor-giris_220ms_ease-out] flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
              {chosen.familyLabel}
            </p>
            <h3 className="text-pretty text-[clamp(1.5rem,1.1rem+1.2vw,2rem)] font-semibold leading-tight tracking-tight text-ink">
              {chosen.label}
            </h3>
            <p className="max-w-md text-[15px] leading-relaxed text-ink-2">{chosen.description}</p>
          </div>

          <dl className="grid max-w-md grid-cols-3 gap-4 border-y border-border py-4">
            <Term label="Kayıtlar" value={chosen.terms.customer} />
            <Term label="Kaynaklar" value={chosen.terms.resource} />
            <Term label={chosen.terms.service} value={`${chosen.serviceCount} hazır`} />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="#demo"
              className="inline-flex h-10 items-center justify-center rounded border border-brand bg-brand px-4 text-[14px] font-medium text-brand-ink no-underline transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong"
            >
              Bu Sektörle Demoyu Başlatın
            </Link>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => select(index - 1)}
                aria-label="Önceki sektör"
                className="inline-flex size-10 items-center justify-center rounded border border-border bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              >
                <Chevron direction="left" />
              </button>
              <button
                type="button"
                onClick={() => select(index + 1)}
                aria-label="Sonraki sektör"
                className="inline-flex size-10 items-center justify-center rounded border border-border bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              >
                <Chevron direction="right" />
              </button>
            </div>
          </div>

          <p className="text-[13px] text-ink-3">
            Çarkı fareyle tutup çevirin — ya da ok tuşlarını kullanın.
          </p>
        </div>

        {/* Çemberin kendisi: kutunun sağından taşıyor, bölüm onu kırpıyor.
            `--halka-r` yarıçapı tek yerde tutuyor; chip'lerin transform'u
            JavaScript'ten yazılıyor ve bu değişkeni okuyor. */}
        <div className="relative min-h-[26rem] lg:min-h-[30rem]">
          <div
            ref={ringRef}
            role="tablist"
            aria-label="Sektörler"
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ ["--halka-r" as string]: "13.5rem" }}
            className={`absolute left-0 top-1/2 size-[30rem] -translate-y-1/2 touch-pan-y select-none xl:size-[34rem] xl:[--halka-r:15.5rem] ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {/* Yörünge: çemberin nerede olduğu görünsün, dekor değil */}
            <span
              aria-hidden="true"
              className="absolute inset-6 rounded-full border border-dashed border-brand-line"
            />
            <span
              aria-hidden="true"
              className="absolute inset-[5.5rem] rounded-full border border-border"
            />
            {/* Çapa: seçilinin oturduğu yer, çemberin sol ucu */}
            <span
              aria-hidden="true"
              className="absolute left-6 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
            />

            {/* Göbek: kaç sektör olduğunu söyler, sayfayla birlikte döner */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex size-[8.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-border bg-surface text-center">
              <span data-numeric className="text-[26px] font-semibold tracking-tight text-ink">
                {count}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                hazır sektör
              </span>
            </div>

            {slides.map((slide, position) => {
              const active = position === index;
              return (
                <button
                  key={slide.key}
                  id={`sektor-halka-${position}`}
                  ref={(node) => {
                    chipsRef.current[position] = node;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="sektor-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(position)}
                  className={`absolute left-1/2 top-1/2 w-[9.5rem] rounded-full border px-3 py-2 text-[13px] font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ${
                    active
                      ? "border-brand bg-brand text-brand-ink shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]"
                      : "border-border bg-surface text-ink-2 [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:text-ink"
                  }`}
                >
                  <span className="block truncate">{shortLabel(slide.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- seçilen sektörün ayrıntısı --- */}
      <div
        id="sektor-panel"
        role="tabpanel"
        aria-labelledby={`sektor-halka-${index}`}
        tabIndex={0}
        className="rounded-lg border border-border bg-surface p-5 sm:p-7"
      >
        <div
          key={chosen.key}
          className="grid animate-[sektor-giris_220ms_ease-out] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12"
        >
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-2 lg:hidden">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                {chosen.familyLabel}
              </p>
              <h3 className="text-[22px] font-semibold tracking-tight text-ink">{chosen.label}</h3>
              <p className="text-[15px] leading-relaxed text-ink-2">{chosen.description}</p>
            </div>

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

            <DayPreview slide={chosen} />

            {chosen.note && (
              <p className="border-l-2 border-brand-line pl-3 text-[13px] leading-relaxed text-ink-3">
                {chosen.note}
              </p>
            )}

            <p data-numeric className="mt-auto text-[13px] text-ink-3">
              {chosen.fieldCount} sektöre özel alan
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {/* Çizim sektörü bir bakışta anlatıyor; ürünün kendisi solda
                duruyor ki görsel iddiayı değil ortamı taşısın. */}
            <SectorIllustration sector={chosen.key} />
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
