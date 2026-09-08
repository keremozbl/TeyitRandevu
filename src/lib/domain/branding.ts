import { z } from "zod";

/**
 * `tenant_settings.branding` — kurumun randevu sayfasındaki görünüşü.
 *
 * Hastanın gördüğü tek yüzey o sayfa ve bugüne kadar her kurumda aynıydı.
 * Buradaki üç alan onu kurumun sayfası yapıyor: logo, aksan rengi ve
 * fiyatların görünüp görünmeyeceği.
 *
 * **Renk serbest metin değil, listeden seçiliyor.** Serbest hex kabul etmek
 * kulağa cömert geliyor ama sonucu okunmayan bir sayfa: kurum açık sarıyı
 * seçtiğinde beyaz yazı kayboluyor. Buradaki tonların hepsi beyaz metinle
 * WCAG AA eşiğini geçiyor ve koyu temada da çalışıyor.
 *
 * Ayrıştırma savunmacı: jsonb şemasız, eksik ya da bozuk anahtar sayfayı
 * düşürmez, varsayılana iner (bkz. booking-rules, terminology).
 */

export type AccentOption = { key: string; label: string; value: string };

export const ACCENTS: AccentOption[] = [
  { key: "teal", label: "Teal", value: "#0E5F6E" },
  { key: "jade", label: "Yeşil", value: "#0A6B4F" },
  { key: "indigo", label: "Lacivert", value: "#2A4B8D" },
  { key: "plum", label: "Bordo", value: "#7A2E4E" },
  { key: "amber", label: "Kehribar", value: "#8A5A12" },
  { key: "slate", label: "Antrasit", value: "#3A4450" },
];

export const DEFAULT_ACCENT = ACCENTS[0].value;

const accentValues = ACCENTS.map((accent) => accent.value);

export const brandingSchema = z.object({
  /** Storage yolu: `<tenant_id>/<dosya>`; kova `kurum-gorsel` */
  logo_path: z.string().trim().max(300).nullable().catch(null).default(null),
  accent: z
    .string()
    .trim()
    .refine((value) => accentValues.includes(value))
    .catch(DEFAULT_ACCENT)
    .default(DEFAULT_ACCENT),
  /** Hizmet ücreti randevu sayfasında görünsün mü — sektöre göre değişiyor */
  show_prices: z.boolean().catch(false).default(false),
  /** Sayfanın başındaki kısa tanıtım; boşsa hiç çizilmez */
  about: z.string().trim().max(400).catch("").default(""),
});

export type Branding = z.infer<typeof brandingSchema>;

export const DEFAULT_BRANDING: Branding = {
  logo_path: null,
  accent: DEFAULT_ACCENT,
  show_prices: false,
  about: "",
};

export function parseBranding(raw: unknown): Branding {
  const parsed = brandingSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_BRANDING };
}

/**
 * Logo sınırları — tarayıcı ve sunucu aynı sayıyı görsün diye burada.
 *
 * 512 KB, `kurum-gorsel` kovasının kendi `file_size_limit` değeriyle birebir
 * aynı (`supabase/schemas/96_storage.sql`). İkisi ayrışırsa kullanıcı formda
 * kabul edilen bir dosyanın Storage tarafından reddedildiğini görür.
 *
 * Bu kontrolün tarayıcıda DA yapılması şart, çünkü server action'ların gövde
 * sınırı 1 MB: 2 MB'lık bir logo action'a hiç ulaşmıyor, Next isteği önce
 * reddediyor ve sunucudaki "512 KB'tan küçük olmalı" mesajı hiç çalışmıyordu.
 * Kullanıcının gördüğü şey uygulamanın çökmesiydi.
 */
export const LOGO_MAX_BYTES = 512 * 1024;

export const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Logonun herkese açık adresi.
 *
 * Kova public olduğu için imzalı URL yok: sayfayı gören hasta oturum açmış
 * değil ve logoda gizli bir şey yok.
 */
export function logoUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/kurum-gorsel/${path}`;
}
