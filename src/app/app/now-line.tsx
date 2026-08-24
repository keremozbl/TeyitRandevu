"use client";

import { useEffect, useState } from "react";

/**
 * "Şu an" çizgisi.
 *
 * Sunucuda çizilmez: ilk render'da `null` döner, çizgi ancak tarayıcıda
 * belirir. Sebep hydration — sunucunun saati ile tarayıcınınki aynı milisaniye
 * olmadığı için sunucuda çizilen çizgi her seferinde uyuşmazlık üretirdi.
 */
export function NowLine({
  dayStartsAt,
  gridFromMinutes,
  gridToMinutes,
  pxPerMinute,
  showMarker = false,
}: {
  dayStartsAt: Date;
  gridFromMinutes: number;
  gridToMinutes: number;
  pxPerMinute: number;
  /** Yuvarlak imleç yalnız ilk sütunda çizilir; her sütunda tekrarlamasın. */
  showMarker?: boolean;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMinutes((Date.now() - dayStartsAt.getTime()) / 60_000);
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [dayStartsAt]);

  if (minutes === null || minutes < gridFromMinutes || minutes > gridToMinutes) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-10 border-t border-accent"
      style={{ top: (minutes - gridFromMinutes) * pxPerMinute }}
    >
      {showMarker && (
        <span className="absolute left-0 top-0 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
    </div>
  );
}
