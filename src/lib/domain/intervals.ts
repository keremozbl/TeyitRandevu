/**
 * Aralık cebiri. Tüm aralıklar yarı açıktır: [start, end).
 *
 * Yarı açıklık tercih değil zorunluluk: veritabanındaki çakışma kısıtı da
 * `tstzrange(blocked_from, blocked_to, '[)')` ile yarı açık çalışıyor. Uç uca
 * gelen iki randevu (10:00–10:30 ve 10:30–11:00) çakışmaz; burada da öyle.
 */

export type Interval = { start: Date; end: Date };

type MsInterval = { start: number; end: number };

function toMs(intervals: readonly Interval[]): MsInterval[] {
  return intervals.map(({ start, end }) => ({ start: start.getTime(), end: end.getTime() }));
}

function toDates(intervals: readonly MsInterval[]): Interval[] {
  return intervals.map(({ start, end }) => ({ start: new Date(start), end: new Date(end) }));
}

function mergeMs(intervals: readonly MsInterval[]): MsInterval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: MsInterval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    // uç uca değen aralıklar da birleşir: [9,10) ∪ [10,11) = [9,11)
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function subtractMs(base: readonly MsInterval[], cuts: readonly MsInterval[]): MsInterval[] {
  const holes = mergeMs(cuts);
  const result: MsInterval[] = [];
  for (const piece of mergeMs(base)) {
    let { start } = piece;
    for (const hole of holes) {
      if (hole.end <= start) continue;
      if (hole.start >= piece.end) break;
      if (hole.start > start) result.push({ start, end: hole.start });
      start = Math.max(start, hole.end);
      if (start >= piece.end) break;
    }
    if (start < piece.end) result.push({ start, end: piece.end });
  }
  return result;
}

/** Çakışan ve uç uca değen aralıkları birleştirir, sıralı döner. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  return toDates(mergeMs(toMs(intervals)));
}

/** `base` içinden `cuts` aralıklarını çıkarır. */
export function subtractIntervals(base: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  return toDates(subtractMs(toMs(base), toMs(cuts)));
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** `inner` tamamen `outer` içinde mi. */
export function intervalContains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function intervalMinutes(interval: Interval): number {
  return (interval.end.getTime() - interval.start.getTime()) / 60_000;
}
