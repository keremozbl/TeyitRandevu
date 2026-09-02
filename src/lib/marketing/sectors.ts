import { renderTemplate, TEMPLATE_VARIABLES } from "@/lib/notifications/render";
import { FAMILY_LABELS, listTemplates, type SectorTemplate } from "@/lib/templates";

/**
 * Sektör şablonlarından pazarlama sitesi için gösterim verisi üretir.
 *
 * Sunucuda çalışır ve istemciye yalnızca gerekli alanları geçirir: şablon
 * JSON'ları (altı dosya, her biri birkaç KB) tarayıcı paketine girmesin.
 *
 * Buradaki her satır şablonun kendisinden geliyor — site ile ürün ayrı
 * düşemesin diye. Bir şablona hizmet eklendiğinde ana sayfadaki önizleme de
 * değişir; kimse iki yeri güncellemeyi hatırlamak zorunda kalmaz.
 */

export type PreviewBlock = {
  /** Yarım saatlik ızgarada kaçıncı satırdan başlıyor */
  row: number;
  /** Kaç satır sürüyor */
  span: number;
  column: number;
  service: string;
  who: string;
  tone: "confirmed" | "pending" | "arrived";
};

export type SectorSlide = {
  key: string;
  label: string;
  familyLabel: string;
  description: string;
  /** Şablonun getirdiği dil: "Hasta" / "Danışan" / "Müşteri" */
  terms: { customer: string; resource: string; service: string };
  serviceCount: number;
  fieldCount: number;
  services: { name: string; duration: number }[];
  columns: string[];
  rows: string[];
  blocks: PreviewBlock[];
  /** Şablondaki hatırlatma metni, örnek değerlerle doldurulmuş hali */
  reminder: string;
  /** `public/sektor/` altındaki telifsiz fotoğraf (Pexels lisansı) */
  photo: { src: string; alt: string };
  /** Şablonun kendi notu — sektöre özel dikkat (varsa) */
  note?: string;
};

const PEOPLE = ["A. Yılmaz", "M. Kaya", "Z. Ateş", "S. Demir", "E. Şahin", "B. Aydın"];
const TONES = ["confirmed", "pending", "arrived", "confirmed"] as const;

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function toClock(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Örnek hatırlatma metni.
 *
 * Değişkenler `TEMPLATE_VARIABLES` içindeki örneklerden geliyor; sektöre göre
 * değişmesi gerekenler (kurum ve uygulayıcı adı) üstüne yazılıyor. Metni
 * ürünün kendi render'ı üretiyor, elle kurulmuş bir cümle değil.
 */
function sampleReminder(template: SectorTemplate): string {
  const notification =
    template.notification_defaults.find(
      (item) => item.trigger === "before_start" && item.offset_minutes <= -1440,
    ) ?? template.notification_defaults[0];

  if (!notification) return "";

  const variables: Record<string, string> = Object.fromEntries(
    TEMPLATE_VARIABLES.map((variable) => [variable.key, variable.example]),
  );

  const staff = template.resources.find((resource) => resource.kind === "staff");
  variables.kurum_adi = `Örnek ${template.label.split(" ")[0]}`;
  variables.hekim_adi = [staff?.title, staff?.name].filter(Boolean).join(" ") || "Uzman 1";
  variables.hizmet_adi = template.services[0]?.name ?? "Randevu";
  variables.randevu_baglantisi = "teyitrandevu.com/r/…";

  return renderTemplate(notification.body, variables).text;
}

/** Yarım saatlik ızgarada gerçekçi bir gün: iki sütun, dört randevu. */
function buildPreview(template: SectorTemplate) {
  const staff = template.resources.filter((resource) => resource.kind === "staff");
  const columns = (staff.length > 0 ? staff : template.resources)
    .slice(0, 2)
    .map((resource) => [resource.title, resource.name].filter(Boolean).join(" "));

  const start = toMinutes(template.working_hours.starts_at);
  const rows = Array.from({ length: 6 }, (_, index) => toClock(start + index * 30));

  const services = template.services.slice(0, 4);
  const blocks: PreviewBlock[] = services.map((service, index) => {
    const column = columns.length > 1 ? index % 2 : 0;
    // Sütunlar birbirini kesmesin: her sütunun kendi iki randevusu var.
    const slot = Math.floor(index / Math.max(columns.length, 1));
    const row = column === 0 ? slot * 3 : slot * 3 + 1;
    return {
      row,
      span: Math.min(3, Math.max(1, Math.ceil(service.duration_min / 30))),
      column,
      service: service.name,
      who: PEOPLE[index % PEOPLE.length],
      tone: TONES[index % TONES.length],
    };
  });

  return { columns, rows, blocks };
}

export function listSectorSlides(): SectorSlide[] {
  return listTemplates().map((template) => {
    const { columns, rows, blocks } = buildPreview(template);

    return {
      key: template.key,
      label: template.label,
      familyLabel: FAMILY_LABELS[template.family],
      description: template.description,
      terms: {
        customer: template.terminology.customer_plural,
        resource: template.terminology.resource_plural,
        service: template.terminology.service_plural,
      },
      serviceCount: template.services.length,
      fieldCount: template.customer_fields.length + template.appointment_fields.length,
      services: template.services.slice(0, 5).map((service) => ({
        name: service.name,
        duration: service.duration_min,
      })),
      columns,
      rows,
      blocks,
      reminder: sampleReminder(template),
      photo: {
        src: `/sektor/${template.key.replace(/_/g, "-")}.jpg`,
        alt: `${template.label} çalışma alanı`,
      },
      note: template.notes?.[0],
    };
  });
}
