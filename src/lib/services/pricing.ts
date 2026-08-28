/**
 * Hizmet fiyatı ve süresinin saf yardımcıları.
 *
 * Fiyat alanı serbest metin: resepsiyon "1.250,00" da yazar "1250" da, ikisi
 * de aynı sayıdır. Türkçede binlik ayırıcı nokta, ondalık ayırıcı virgül —
 * `Number("1.250,00")` NaN döner, o yüzden çeviri elle yapılıyor.
 *
 * Para her zaman `Intl.NumberFormat("tr-TR")` ile gösterilir; sayıyı kendimiz
 * biçimlendirirsek kuruş ve binlik ayırıcı er geç ayrışır.
 */

/**
 * Serbest yazılmış tutarı sayıya çevirir. Çeviremezse null döner — çağıran
 * hata mesajını kendisi verir, sessizce 0 yazılmaz.
 */
export function parseMoney(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^[\d.,\s]+$/.test(trimmed)) return null;

  const cleaned = trimmed.replace(/\s/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Türkçe yazım: nokta binlik, virgül ondalık
    normalized = cleaned.replaceAll(".", "").replace(",", ".");
  } else {
    // Nokta ondalık: "1250.50" — ama "1.250" binlik ayırıcı olabilir
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals === 3 ? cleaned.replaceAll(".", "") : cleaned.replaceAll(",", "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999) return null;
  return Math.round(value * 100) / 100;
}

/** Gösterim: 1250.5 → "1.250,50 ₺" */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Form alanına geri yazarken: 1250.5 → "1250,50" */
export function moneyToInput(value: number | null): string {
  if (value === null) return "";
  return value.toFixed(2).replace(".", ",");
}

/**
 * Randevunun takvimde kapladığı toplam süre — tampon dahil.
 *
 * Bu sayı çakışma hesabına giren şey: 30 dakikalık bir işlem 15 dakika
 * sterilizasyonla birlikte 45 dakika yer kaplar.
 */
export function blockedMinutes(service: {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}): number {
  return service.durationMin + service.bufferBeforeMin + service.bufferAfterMin;
}

/** Listede tek satırlık süre özeti. */
export function describeDuration(service: {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}): string {
  const parts: string[] = [];
  if (service.bufferBeforeMin > 0) parts.push(`${service.bufferBeforeMin} dk önce`);
  if (service.bufferAfterMin > 0) parts.push(`${service.bufferAfterMin} dk sonra`);
  const base = `${service.durationMin} dk`;
  return parts.length > 0 ? `${base} + ${parts.join(", ")}` : base;
}
