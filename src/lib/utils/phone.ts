/**
 * Türkiye telefon numarasını E.164'e çevirir: +905551234567
 *
 * Veritabanındaki `public.phone_e164` domain'i bu biçimi zorunlu kılıyor.
 * Resepsiyon "0555 123 45 67" yazar, "(555) 123-45-67" yazar, bazen başına
 * +90 koyar — hepsi aynı numaradır ve kayıt aynı biçimde tutulmalı, yoksa
 * telefonla arama ve tekrar kayıt kontrolü çalışmaz.
 *
 * Çeviremezse null döner; çağıran hata mesajını kendisi verir.
 */
export function toE164(input: string, defaultCountry = "90"): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (!hasPlus) {
    // 00 ile başlayan uluslararası arama öneki
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
      // 0555... — ülke kodu yok
      digits = defaultCountry + digits.slice(1);
    } else if (digits.length === 10) {
      // 5551234567 — ne sıfır ne ülke kodu
      digits = defaultCountry + digits;
    }
  }

  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

/** Gösterim için: +905551234567 → 0555 123 45 67 */
export function formatPhoneTr(e164: string): string {
  const match = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}
