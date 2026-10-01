import { qrPath } from "@/lib/booking/qr";

/**
 * QR kodu — sunucuda çizilir.
 *
 * Kodlayıcı sunucu tarafında kalıyor: istemciye gönderilseydi hiç
 * etkileşimi olmayan bir görsel için birkaç kilobayt JavaScript inecekti.
 * Matris zaten sabit, adres sayfa açılırken belli.
 *
 * `currentColor` ile boyanıyor; koyu temada kod kendiliğinden açık renge
 * dönüyor. Basılacak sürüm bu değil — onu `qr-png.ts` üretiyor ve orada
 * zemin her zaman beyaz.
 */
export function QrCode({
  value,
  label,
  className = "",
}: {
  value: string;
  /** Ekran okuyucuya söylenecek ad; yoksa kod dekoratif sayılır. */
  label?: string;
  className?: string;
}) {
  const { d, extent } = qrPath(value);

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <path fill="currentColor" d={d} />
    </svg>
  );
}
