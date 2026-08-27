"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { blockBand } from "@/lib/scheduling/drag";
import { STATUS_STYLES, type AppointmentStatus } from "@/lib/scheduling/status";

import { useGrid } from "./grid-surface";

/**
 * Izgaradaki tek bir randevu.
 *
 * Konumunu kendi hesaplar. Sebep sürükleme: sürüklerken blok parmağın altında
 * kıpırdamalı, bıraktıktan sonra da sunucu onaylayana kadar yeni yerinde
 * kalmalı. İkisi de "geçici bir konum" demek ve bunu bilen tek yer React
 * olmalı — DOM'a elle yazılan bir konum, sunucudan gelen yeni değerle
 * çakışırdı.
 *
 * Geçici konum `grid-surface` içindeki küçük bir depoda tutulur ve yalnızca
 * ilgili blok ona abone olur: elli randevulu bir günde sürükleme sırasında tek
 * bir bileşen yeniden çizilir.
 */

/** Blok bu yükseklikten kısa çizilmez; beş dakikalık randevu da tıklanabilmeli. */
const MIN_BLOCK_HEIGHT = 16;

export type AppointmentBlockProps = {
  id: string;
  resourceId: string;
  startsAtMs: number;
  durationMinutes: number;
  /** Randevudan önce ve sonra bloke edilen hazırlık/temizlik süresi */
  bufferBeforeMin: number;
  bufferAfterMin: number;
  status: AppointmentStatus;
  customerName: string;
  serviceName: string | null;
  href: string;
  /** Az önce oluşturulan ya da düzenlenen randevu */
  highlighted: boolean;
};

export function AppointmentBlock(props: AppointmentBlockProps) {
  const grid = useGrid();
  const { id, resourceId, startsAtMs, status, customerName, serviceName, href } = props;

  const subscribe = useCallback(
    (listener: () => void) => grid.subscribe(id, listener),
    [grid, id],
  );
  const draft = useSyncExternalStore(
    subscribe,
    () => grid.read(id),
    () => null,
  );

  const baseStart = (startsAtMs - grid.dayStartsAtMs) / 60_000;
  const startMinutes = draft?.startMinutes ?? baseStart;
  const durationMinutes = draft?.durationMinutes ?? props.durationMinutes;

  // Sunucu taşımayı onayladığında taslak ile gerçek üst üste düşer; o an
  // taslağın işi biter. Kendi kendini temizlemesi, "ne zaman silinecek"
  // sorusunu tek bir karşılaştırmaya indiriyor.
  useEffect(() => {
    if (!draft || draft.pending) return;
    if (
      draft.startMinutes === baseStart &&
      draft.durationMinutes === props.durationMinutes &&
      draft.resourceId === resourceId
    ) {
      grid.clear(id);
    }
  }, [draft, baseStart, props.durationMinutes, resourceId, grid, id]);

  const band = blockBand({
    startMinutes,
    durationMinutes,
    bounds: grid.bounds,
    pxPerMinute: grid.pxPerMinute,
  });
  const height = Math.max(band.height, MIN_BLOCK_HEIGHT);
  const compact = height < 34;

  const buffer = blockBand({
    startMinutes: startMinutes - props.bufferBeforeMin,
    durationMinutes: props.bufferBeforeMin + durationMinutes + props.bufferAfterMin,
    bounds: grid.bounds,
    pxPerMinute: grid.pxPerMinute,
  });
  const hasBuffer = props.bufferBeforeMin > 0 || props.bufferAfterMin > 0;

  // Sürüklenen blok başka bir sütuna geçtiyse yatay kayma ile oraya taşınır:
  // sunucu onaylayınca gerçekten o sütunun içinde yeniden çizilecek.
  const offsetX = draft && draft.resourceId !== resourceId ? draft.offsetX : 0;
  const dragging = draft?.dragging ?? false;
  const transform = offsetX ? `translateX(${Math.round(offsetX)}px)` : undefined;

  const style: CSSProperties = { top: band.top, height, transform };
  const info = { id, resourceId, startMinutes, durationMinutes, name: customerName };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => grid.begin(event, info);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => grid.resizeByKey(event, info);

  const statusStyle = STATUS_STYLES[status];
  const range = `${grid.formatTime(startMinutes)}–${grid.formatTime(startMinutes + durationMinutes)}`;

  return (
    <>
      {hasBuffer && buffer.height > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0.5 rounded-sm bg-ink-3/15"
          style={{ top: buffer.top, height: buffer.height, transform }}
          title="Tampon süre"
        />
      )}

      {/* Blok bir bağlantı değil, bağlantı taşıyan bir kutu: `<a>` içine buton
          konmaz ve sürükleme tutamağı gerçek bir buton olmak zorunda.
          Tıklanabilir yüzeyi bağlantının kendi `::after` katmanı sağlıyor. */}
      <div
        data-appointment
        data-id={id}
        onPointerDown={onPointerDown}
        className={`group absolute inset-x-0.5 overflow-hidden rounded-sm border-l-2 px-1.5 py-0.5 ${statusStyle.block} ${
          dragging
            ? "pointer-events-none z-20 outline-2 outline-offset-1 outline-accent"
            : "cursor-grab hover:brightness-95"
        } ${draft?.pending ? "opacity-60" : ""} ${
          highlightRing(props.highlighted, dragging)
        }`}
        style={style}
        title={`${range} · ${customerName}${serviceName ? ` · ${serviceName}` : ""} · ${statusStyle.label}`}
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <time
            dateTime={new Date(startsAtMs).toISOString()}
            className="shrink-0 font-mono text-[11px] text-ink-2"
          >
            {grid.formatTime(startMinutes)}
          </time>
          <Link
            href={href}
            draggable={false}
            className="min-w-0 truncate text-[12px] font-medium text-ink no-underline after:absolute after:inset-0 hover:underline"
          >
            {customerName}
          </Link>
          <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wide text-ink-2">
            {statusStyle.short}
            <span className="sr-only"> — {statusStyle.label}</span>
          </span>
        </div>
        {!compact && serviceName && (
          <p className="truncate text-[11px] text-ink-2">{serviceName}</p>
        )}

        <button
          type="button"
          data-resize-handle
          onKeyDown={onKeyDown}
          aria-label={`${customerName} · süre ${durationMinutes} dakika · yukarı ve aşağı ok tuşlarıyla değiştirin`}
          className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize rounded-b-sm bg-transparent transition-colors duration-150 hover:bg-accent/40 focus-visible:bg-accent/40 group-hover:bg-accent/20"
        />
      </div>
    </>
  );
}

/** Sürüklenirken halka zaten var; iki halka üst üste binmesin. */
function highlightRing(highlighted: boolean, dragging: boolean): string {
  if (dragging || !highlighted) return "";
  return "outline-2 outline-offset-1 outline-accent";
}
