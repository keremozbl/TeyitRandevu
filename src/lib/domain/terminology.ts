import { z } from "zod";

/**
 * `tenant_settings.terminology` jsonb'sinin okunması.
 *
 * Kurum kurulurken sektör şablonundan KOPYALANIR: diş kliniğinde "Hasta",
 * diyetisyende "Danışan", berberde "Müşteri". Panelin bu kelimeleri
 * kullanması kozmetik değil — bir berbere "Hastalar" yazan ekran, ürünün o
 * işletme için düşünülmediğini söyler.
 *
 * Ayrıştırma savunmacı: jsonb şemasız, eksik ya da bozuk bir anahtar yüzünden
 * panel çökmez, o anahtar varsayılana düşer. Varsayılanlar sektörden bağımsız
 * ve nötr; şablonu olmayan (elle kurulmuş) bir kurumda da okunur bir dil.
 */

export const DEFAULT_TERMS = {
  customer_singular: "Müşteri",
  customer_plural: "Müşteriler",
  service_singular: "Hizmet",
  service_plural: "Hizmetler",
  resource_singular: "Uzman",
  resource_plural: "Uzmanlar",
  appointment_singular: "Randevu",
  appointment_plural: "Randevular",
} as const;

/** Tek bir kelime: boş ya da absürt uzunlukta değer varsayılana düşer. */
const word = (fallback: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(40)
    .catch(fallback)
    .default(fallback);

export const terminologySchema = z.object({
  customer_singular: word(DEFAULT_TERMS.customer_singular),
  customer_plural: word(DEFAULT_TERMS.customer_plural),
  service_singular: word(DEFAULT_TERMS.service_singular),
  service_plural: word(DEFAULT_TERMS.service_plural),
  resource_singular: word(DEFAULT_TERMS.resource_singular),
  resource_plural: word(DEFAULT_TERMS.resource_plural),
  appointment_singular: word(DEFAULT_TERMS.appointment_singular),
  appointment_plural: word(DEFAULT_TERMS.appointment_plural),
});

export type Terminology = z.infer<typeof terminologySchema>;

export function parseTerminology(raw: unknown): Terminology {
  const parsed = terminologySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_TERMS };
}

/**
 * Cümle içinde küçük harfle geçen kullanım: "yeni hasta", "hasta bulunamadı".
 *
 * Türkçe için `toLocaleLowerCase("tr-TR")` şart: "İmplant" → "implant",
 * `toLowerCase()` ise "i̇mplant" üretir (nokta kalır).
 */
export function lower(term: string): string {
  return term.toLocaleLowerCase("tr-TR");
}
