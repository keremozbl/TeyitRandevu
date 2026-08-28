import disKlinigi from "./dis-klinigi.json";
import berber from "./berber.json";

/**
 * Sektör şablonları.
 *
 * Şablon REFERANS DEĞİL KOPYA olarak çalışır: kayıt sırasında seçilen şablonun
 * içeriği tenant'ın kendi satırlarına kopyalanır. Şablon sonradan güncellenirse
 * mevcut kurumlar etkilenmez (Plan Bölüm 4).
 *
 * Yeni sektör eklemek = buraya bir JSON dosyası koymak. Kod değişmez.
 */

export type BusinessFamily = "saglik" | "kisisel_bakim" | "hizmet";

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "phone";

export interface TemplateField {
  key: string;
  label: string;
  kind: FieldKind;
  is_required?: boolean;
  /** Tıbbi alanlar ayrı izne tabidir; resepsiyon bunları görmez. */
  is_medical?: boolean;
  options?: string[];
}

export interface TemplateService {
  name: string;
  duration_min: number;
  buffer_before_min?: number;
  buffer_after_min?: number;
  category?: string;
  price?: number;
}

export interface TemplateResource {
  kind: "staff" | "room" | "device";
  name: string;
  title?: string;
  color?: string;
}

export interface TemplateNotification {
  /** message_templates.key — kurum içinde benzersiz */
  key: string;
  name: string;
  trigger: "appointment_created" | "before_start" | "after_end" | "no_show" | "birthday";
  /** Negatif = tetikleyiciden önce; -1440 "bir gün önce" */
  offset_minutes: number;
  channel: "sms" | "whatsapp" | "email" | "voice";
  /** Ticari ileti ise İYS onayı ve ret hakkı zorunludur (CLAUDE.md kural 7). */
  is_commercial: boolean;
  /** `{{musteri_adi}}` gibi değişkenler taşır; bkz. lib/notifications/render */
  body: string;
  subject?: string;
}

export interface SectorTemplate {
  key: string;
  family: BusinessFamily;
  label: string;
  description: string;
  terminology: Record<string, string>;
  modules: string[];
  roles: string[];
  booking_rules: {
    min_lead_minutes: number;
    max_advance_days: number;
    cancel_window_minutes: number;
    hold_minutes: number;
  };
  resources: TemplateResource[];
  working_hours: {
    weekdays: number[];
    starts_at: string;
    ends_at: string;
    break: { starts_at: string; ends_at: string } | null;
  };
  services: TemplateService[];
  customer_fields: TemplateField[];
  appointment_fields: TemplateField[];
  /**
   * Kurulumda kopyalanan bildirim şablonları ve akışları. Her satır hem metni
   * (şablon) hem de ne zaman gideceğini (akış) tanımlar — ikisi kurulumda iki
   * ayrı tabloya açılır.
   */
  notification_defaults: TemplateNotification[];
  notes?: string[];
}

export const TEMPLATES = {
  dis_klinigi: disKlinigi as SectorTemplate,
  berber: berber as SectorTemplate,
} satisfies Record<string, SectorTemplate>;

export type TemplateKey = keyof typeof TEMPLATES;

export function getTemplate(key: string): SectorTemplate | undefined {
  return TEMPLATES[key as TemplateKey];
}

export function listTemplates(): SectorTemplate[] {
  return Object.values(TEMPLATES);
}

export function listTemplatesByFamily(family: BusinessFamily): SectorTemplate[] {
  return listTemplates().filter((t) => t.family === family);
}

export const FAMILY_LABELS: Record<BusinessFamily, string> = {
  saglik: "Sağlık",
  kisisel_bakim: "Kişisel Bakım",
  hizmet: "Hizmet",
};
