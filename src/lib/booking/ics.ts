/**
 * Takvim dosyası (RFC 5545) — "takvime ekle" bağlantısının ürettiği şey.
 *
 * Saf ve senkron: veritabanı yok, `Date.now()` yok. Damga çağıran taraftan
 * geliyor ki çıktı testlenebilsin.
 *
 * Neden dosya, neden Google Takvim bağlantısı değil: hastanın telefonunda
 * hangi takvim uygulamasının olduğunu bilmiyoruz ve bir tarayıcı bağlantısı
 * hastayı üçüncü bir servise götürür. `.ics` iPhone'da, Android'de ve
 * masaüstünde aynı şekilde açılıyor ve hiçbir yere veri göndermiyor.
 */

export type IcsEvent = {
  /** Randevu token'ı — UID'nin gövdesi olur, tekrar eklemede kopya oluşmaz */
  uid: string;
  startsAt: Date;
  endsAt: Date;
  stamp: Date;
  title: string;
  description?: string;
  location?: string;
  url?: string;
};

/** RFC 5545: ters bölü, noktalı virgül, virgül ve satır sonu kaçırılır. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC damgası: 20260904T063000Z */
export function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Satır katlama.
 *
 * RFC 5545 bir satırı 75 OKTETLE sınırlıyor — karakterle değil. Türkçe
 * metinde "ğ" iki oktet ve karakter sayarak katlayan bir kod, uzun bir
 * hizmet adında sınırı aşıyor; bazı takvim uygulamaları o dosyayı hiç
 * açmıyor. Bu yüzden ölçü UTF-8 bayt uzunluğu.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // Devam satırları bir boşlukla başlar; o boşluk da sınıra dahil.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) out.push(current);

  return out.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeyitRandevu//Randevu//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@teyitrandevu`,
    `DTSTAMP:${icsStamp(event.stamp)}`,
    `DTSTART:${icsStamp(event.startsAt)}`,
    `DTEND:${icsStamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  // Satır sonu CRLF olmak zorunda; LF ile yazılan dosyayı bazı istemciler
  // sessizce reddediyor.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
