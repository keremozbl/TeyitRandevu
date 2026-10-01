/**
 * Public randevu sayfasının adım mantığı — saf, veritabanısız, testli.
 *
 * Akış: (şube) → hizmet → hekim → gün → saat → bilgiler. Bölümlerin HEPSİ
 * aynı sayfada duruyor; aşağıdaki yardımcılar hangisinin seçili olduğunu
 * hesaplıyor. Her seçim query param'da tutulur (`?hizmet=…&kaynak=…`),
 * state'te değil. Sebebi tek değil:
 *
 *   - Geri tuşu ve sayfa yenileme çalışır; hasta seçimini kaybetmez.
 *   - Bağlantı paylaşılabilir: klinik "şu hizmete şu hekimden randevu al"
 *     bağlantısını doğrudan verebilir.
 *   - JavaScript olmadan da çalışır; her adım bir `<a>`.
 */

// Çalışma zamanı içe aktarımları göreli: birim testleri Node'un test
// koşucusuyla derlenmeden çalışıyor ve `@/` takma adını çözemiyor.
import { addDays, datesBetween, type BookingRules, type PlainDate } from "../domain/index.ts";
import type { PublicResource, PublicService } from "./queries.ts";

/** "Hekim fark etmez" seçeneğinin `kaynak` param'ındaki karşılığı. */
export const ANY_RESOURCE = "farketmez";

/** Gün şeridinde bir seferde kaç gün gösterilir. */
export const WINDOW_DAYS = 14;

export type BookingParams = {
  sube?: string;
  hizmet?: string;
  kaynak?: string;
  /** Gün şeridinin başlangıcı */
  bas?: string;
  /** Seçili gün */
  tarih?: string;
  hata?: string;
  /** Tutulmuş slot'un token'ı; bilgiler bölümü bununla açılıyor */
  tutma?: string;
};

/** Adım bağlantısı. Boş değerler URL'e yazılmaz — adres okunur kalsın. */
export function bookingHref(slug: string, params: BookingParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/r/${slug}?${query}` : `/r/${slug}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: string | undefined): value is PlainDate {
  return Boolean(value && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

/**
 * Hizmeti verebilecek kaynaklar. `service_resources` eşlemesi yoksa kural
 * "her kaynak verebilir" — küçük klinikte eşleme hiç doldurulmuyor ve o
 * durumda liste boş kalırsa sayfa hiç randevu vermez.
 */
export function eligibleResources(
  service: PublicService,
  resources: readonly PublicResource[],
  branchId?: string,
): PublicResource[] {
  const inBranch = branchId ? resources.filter((r) => r.branchId === branchId) : [...resources];
  if (service.resourceIds.length === 0) return inBranch;
  return inBranch.filter((r) => service.resourceIds.includes(r.id));
}

export type DayWindow = {
  /** Şeritteki günler */
  days: PlainDate[];
  /** Bir önceki şeridin başlangıcı; başa gelindiyse null */
  previousStart: PlainDate | null;
  /** Bir sonraki şeridin başlangıcı; ileri tarih sınırına dayandıysa null */
  nextStart: PlainDate | null;
};

/**
 * Gün şeridinin sınırları. İki uçta da kuralın dışına çıkılmaz: bugünden
 * öncesi ve `max_advance_days` sonrası hiç gösterilmez — gösterilse motor
 * zaten boş dönerdi ve hasta "neden hiç saat yok" diye bakardı.
 */
export function resolveDayWindow(
  today: PlainDate,
  rules: BookingRules,
  requestedStart?: string,
): DayWindow {
  const lastOpen = addDays(today, rules.max_advance_days);

  let start = isPlainDate(requestedStart) ? requestedStart : today;
  if (start < today) start = today;
  if (start > lastOpen) start = lastOpen;

  const end = addDays(start, WINDOW_DAYS - 1) > lastOpen ? lastOpen : addDays(start, WINDOW_DAYS - 1);

  const previous = addDays(start, -WINDOW_DAYS);
  const next = addDays(end, 1);

  return {
    days: datesBetween(start, end),
    previousStart: start > today ? (previous < today ? today : previous) : null,
    nextStart: next > lastOpen ? null : next,
  };
}

/**
 * Seçili gün: istenen gün şeritteyse o, değilse şeritte saati olan ilk gün.
 * Hasta sayfayı açtığında boş bir güne değil, randevu alabileceği ilk güne
 * bakmalı — "hiç yer yok" izlenimi yanlış olur.
 */
export function resolveSelectedDay(
  days: readonly { date: PlainDate; slots: readonly unknown[] }[],
  requested?: string,
): PlainDate | null {
  if (days.length === 0) return null;
  if (isPlainDate(requested) && days.some((day) => day.date === requested)) return requested;
  return (days.find((day) => day.slots.length > 0) ?? days[0]).date;
}

/**
 * Saat düğmesinin taşıdığı değer: başlangıç anı + o saati verebilecek
 * kaynaklar. İkisi tek değerde çünkü bir `<button>` forma tek isim-değer
 * çifti koyabiliyor ve her slot için ayrı gizli alan üretmek otuz saatlik bir
 * günde iki yüz gizli alan demek.
 */
export function encodeSlotChoice(startsAt: Date, resourceIds: readonly string[]): string {
  return `${startsAt.toISOString()}|${resourceIds.join(",")}`;
}

const CHOICE_RE = /^(\S+)\|([0-9a-fA-F-]{36}(?:,[0-9a-fA-F-]{36})*)$/;

export function decodeSlotChoice(raw: string): { startsAt: Date; resourceIds: string[] } | null {
  const match = CHOICE_RE.exec(raw.trim());
  if (!match) return null;

  const startsAt = new Date(match[1]);
  if (Number.isNaN(startsAt.getTime())) return null;

  return { startsAt, resourceIds: match[2].split(",") };
}
