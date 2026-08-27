/**
 * Izgarada sürüklemenin saf hesabı.
 *
 * Fare hareketi piksel, randevu ise dakikadır. Aradaki çeviri, ızgaraya
 * oturtma ve sınırlama burada yapılır — tarayıcı olayları olmadan test
 * edilebilsin diye. `grid-surface.tsx` yalnızca olayları dinler ve bu
 * fonksiyonların sonucunu çizer.
 *
 * Dakikalar her zaman **yerel gün başlangıcından itibaren** sayılır; ızgaranın
 * kendi ölçüsü de odur (`gridFromMinutes` / `gridToMinutes`). Böylece yaz saati
 * geçişinde bile piksel ile dakika arasındaki oran sabit kalır.
 */

export type GridBounds = {
  /** Izgaranın üst sınırı — gün başlangıcından itibaren dakika */
  fromMinutes: number;
  /** Izgaranın alt sınırı */
  toMinutes: number;
  /** Sürüklemenin oturduğu adım; `booking_rules.slot_step_minutes` */
  stepMinutes: number;
};

/** Randevu süresinin alt ve üst sınırı — sunucudaki zod şemasıyla aynı. */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 1440;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** En yakın adıma oturtur: 09:07 + 15 dakikalık adım → 09:15. */
export function snapToStep(minutes: number, stepMinutes: number): number {
  if (stepMinutes <= 0) return minutes;
  return Math.round(minutes / stepMinutes) * stepMinutes;
}

/** Piksel farkını dakikaya çevirir; ölçek ızgaranın `--slot-h` token'ından gelir. */
export function pixelsToMinutes(pixels: number, pxPerMinute: number): number {
  return pixels / pxPerMinute;
}

/**
 * Taşınan randevunun yeni başlangıcı.
 *
 * Izgaranın dışına taşınamaz: alt sınır aşılırsa randevu kuyruğundan tutulur,
 * yani başlangıç `toMinutes - süre` değerine sabitlenir. Mesai dışına randevu
 * gerektiğinde düzenleme formu kullanılır — orada saat elle yazılır.
 */
export function draggedStart({
  startMinutes,
  durationMinutes,
  deltaMinutes,
  bounds,
}: {
  startMinutes: number;
  durationMinutes: number;
  deltaMinutes: number;
  bounds: GridBounds;
}): number {
  const snapped = snapToStep(startMinutes + deltaMinutes, bounds.stepMinutes);
  return clamp(snapped, bounds.fromMinutes, bounds.toMinutes - durationMinutes);
}

/**
 * Alt kenardan uzatılan randevunun yeni süresi.
 *
 * Tutulan şey bitiş saatidir: oturtma da sınırlama da bitişe uygulanır, süre
 * ondan çıkar. Başlangıç yerinde kalır.
 */
export function resizedDuration({
  startMinutes,
  durationMinutes,
  deltaMinutes,
  bounds,
}: {
  startMinutes: number;
  durationMinutes: number;
  deltaMinutes: number;
  bounds: GridBounds;
}): number {
  const snappedEnd = snapToStep(startMinutes + durationMinutes + deltaMinutes, bounds.stepMinutes);
  const lowestEnd = startMinutes + Math.max(bounds.stepMinutes, MIN_DURATION_MINUTES);
  const highestEnd = Math.min(bounds.toMinutes, startMinutes + MAX_DURATION_MINUTES);
  return clamp(snappedEnd, lowestEnd, highestEnd) - startMinutes;
}

/**
 * Bırakılan yer gerçekten değişti mi?
 *
 * Değişmediyse istek atılmaz: her tıklamada bir UPDATE, hem gereksiz hem de
 * `updated_at` damgasını kirletir.
 */
export function isMoved(
  before: { startMinutes: number; durationMinutes: number; resourceId: string },
  after: { startMinutes: number; durationMinutes: number; resourceId: string },
): boolean {
  return (
    before.startMinutes !== after.startMinutes ||
    before.durationMinutes !== after.durationMinutes ||
    before.resourceId !== after.resourceId
  );
}

/**
 * Bir randevunun ızgaradaki dikey yeri: üst kenar ve yükseklik, piksel.
 *
 * Izgaranın dışına taşan kısım kırpılır — taşan blok sütunun akışını bozar.
 * Sunucu ile istemci aynı bloğu çizdiği için hesap tek yerde durur.
 */
export function blockBand({
  startMinutes,
  durationMinutes,
  bounds,
  pxPerMinute,
}: {
  startMinutes: number;
  durationMinutes: number;
  bounds: GridBounds;
  pxPerMinute: number;
}): { top: number; height: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const bodyHeight = (bounds.toMinutes - bounds.fromMinutes) * pxPerMinute;
  const top = Math.max(0, (startMinutes - bounds.fromMinutes) * pxPerMinute);
  const bottom = Math.min(bodyHeight, (startMinutes + durationMinutes - bounds.fromMinutes) * pxPerMinute);
  return { top: round(top), height: round(Math.max(bottom - top, 0)) };
}
