/**
 * Bildirim ekranının etiketleri ve zamanlama cümleleri — saf, testli.
 *
 * Durum renkleri randevu durumlarıyla aynı semantik seti kullanır ama renk tek
 * başına anlam taşımaz (Plan Bölüm 9): her durumun bir de metin etiketi var.
 */

export type NotificationStatusKey =
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled"
  | "skipped";

export const STATUS_LABELS: Record<NotificationStatusKey, { label: string; tone: string }> = {
  scheduled: { label: "Bekliyor", tone: "text-st-pending" },
  sending: { label: "Gönderiliyor", tone: "text-st-arrived" },
  sent: { label: "Gönderildi", tone: "text-st-confirmed" },
  failed: { label: "Başarısız", tone: "text-st-noshow" },
  cancelled: { label: "İptal edildi", tone: "text-st-cancelled" },
  skipped: { label: "Gönderilmedi", tone: "text-st-cancelled" },
};

export const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "E-posta",
  voice: "Sesli arama",
};

export const TRIGGER_LABELS: Record<string, string> = {
  appointment_created: "Randevu oluşunca",
  before_start: "Randevudan önce",
  after_end: "Randevudan sonra",
  no_show: "Gelmediğinde",
  birthday: "Doğum gününde",
};

/** Ticari ileti hukuken ayrı bir şeydir; etiketi de ayrı görünmeli. */
export const KIND_LABELS: Record<string, string> = {
  service: "Hizmet bilgilendirmesi",
  commercial: "Ticari ileti",
};

/** 90 → "1 saat 30 dakika", 1440 → "1 gün" */
export function humanizeMinutes(minutes: number): string {
  const total = Math.abs(Math.round(minutes));
  if (total === 0) return "0 dakika";

  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0) parts.push(`${hours} saat`);
  if (rest > 0) parts.push(`${rest} dakika`);
  return parts.join(" ");
}

/**
 * Akışın ne zaman çalıştığı, tek cümlede: "Randevudan 1 gün önce".
 * Kurum `-1440` sayısını yorumlamak zorunda kalmamalı.
 */
export function describeFlowTiming(trigger: string, offsetMinutes: number): string {
  if (trigger === "appointment_created") return "Randevu oluşturulur oluşturulmaz";
  if (trigger === "no_show") return "Randevuya gelinmediğinde";
  if (trigger === "birthday") return "Hastanın doğum gününde";

  const anchor = trigger === "after_end" ? "Randevu bitiminden" : "Randevudan";
  if (offsetMinutes === 0) return `${anchor} tam o anda`;

  const direction = offsetMinutes < 0 ? "önce" : "sonra";
  return `${anchor} ${humanizeMinutes(offsetMinutes)} ${direction}`;
}
