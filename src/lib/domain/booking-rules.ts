import { z } from "zod";

/**
 * `tenant_settings.booking_rules` jsonb'sinin okunması.
 *
 * jsonb şemasız olduğu için buradaki ayrıştırma savunmacıdır: bozuk ya da eksik
 * bir anahtar yüzünden randevu sayfası çökmez, o anahtar varsayılana düşer.
 * Değerler veritabanındaki `jsonb_build_object` varsayılanıyla aynı — ikisi
 * ayrışırsa yeni kurulan kurum kodun varsaydığından farklı davranır.
 */

export const DEFAULT_BOOKING_RULES = {
  min_lead_minutes: 120,
  max_advance_days: 60,
  cancel_window_minutes: 240,
  hold_minutes: 10,
  slot_step_minutes: 15,
} as const;

export const bookingRulesSchema = z.object({
  /** En erken kaç dakika sonrasına randevu verilebilir */
  min_lead_minutes: z.number().int().min(0).max(43_200).catch(DEFAULT_BOOKING_RULES.min_lead_minutes),
  /** En fazla kaç gün ilerisi açık */
  max_advance_days: z.number().int().min(1).max(365).catch(DEFAULT_BOOKING_RULES.max_advance_days),
  /** Kaç dakika kala müşteri kendi randevusunu iptal edemez */
  cancel_window_minutes: z.number().int().min(0).max(43_200).catch(DEFAULT_BOOKING_RULES.cancel_window_minutes),
  /** Public sayfada form doldurulurken slot kaç dakika tutulur */
  hold_minutes: z.number().int().min(1).max(60).catch(DEFAULT_BOOKING_RULES.hold_minutes),
  /** Slot ızgarasının adımı */
  slot_step_minutes: z.number().int().min(5).max(240).catch(DEFAULT_BOOKING_RULES.slot_step_minutes),
});

export type BookingRules = z.infer<typeof bookingRulesSchema>;

export function parseBookingRules(raw: unknown): BookingRules {
  const parsed = bookingRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_BOOKING_RULES };
}
