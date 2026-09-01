/**
 * Denetim kaydını okunabilir Türkçeye çevirir.
 *
 * Satırın kendisi `action` + `entity` çiftidir; ekranda "read customer" değil
 * "hasta kartını açtı" yazmalı. Denetim listesini okuyan kişi genellikle
 * hukuki bir soruyla geliyor ("bu kaydı kim gördü"), teknik bir sözlükle
 * değil.
 */

type Key = `${string}:${string}`;

const SUMMARIES: Record<Key, string> = {
  "read:customer": "hasta kartını açtı",
  "read:customer_medical_note": "tıbbi notları okudu",
  "create:customer": "hasta kaydı açtı",
  "update:customer": "hasta kaydını değiştirdi",
  "delete:customer": "hasta kaydını sildi",
  "create:consent": "rıza kaydı düştü",
  "delete:consent": "rızayı geri aldı",
  "create:customer_medical_note": "tıbbi not yazdı",
  "update:customer_medical_note": "tıbbi notu değiştirdi",
  "delete:customer_medical_note": "tıbbi notu sildi",
  "export:report": "raporu dosya olarak indirdi",
  "read:report": "raporu görüntüledi",
};

/** Bilinmeyen çift teknik hâliyle gösterilir: kayıt gizlenmez, yorumlanamaz. */
export function summarize(action: string, entity: string): string {
  return SUMMARIES[`${action}:${entity}` as Key] ?? `${action} · ${entity}`;
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "ad soyad",
  phone: "telefon",
  email: "e-posta",
  birth_date: "doğum tarihi",
  notes: "not",
  tags: "etiketler",
  branch_id: "şube",
};

/** `alan:kan_grubu` gibi esnek alan anahtarları kurumun kendi adıyla yazılır. */
export function fieldLabel(key: string): string {
  if (key.startsWith("alan:")) return key.slice(5);
  return FIELD_LABELS[key] ?? key;
}

const REPORT_LABELS: Record<string, string> = {
  program: "günün programı",
  denetim: "denetim kayıtları",
};

/**
 * Rıza türleri. `consent_kind` enum'unun kısa karşılıkları burada AYRICA
 * duruyor: bu dosya birim testinden çağrılıyor ve hiçbir sunucu modülüne
 * bağlı olmamalı (Node'un test koşucusu `@/` alias'ını çözemiyor).
 */
const CONSENT_LABELS: Record<string, string> = {
  kvkk_aydinlatma: "aydınlatma metni",
  acik_riza_saglik: "sağlık verisi açık rızası",
  ticari_ileti: "ticari ileti izni",
  cerez: "çerez onayı",
};

/**
 * Satırın ikinci satırında görünen ayrıntı. `diff` sütununda hasta verisi
 * yok; burada da üretilmiyor — yalnızca alan adları ve sayılar.
 */
export function detailText(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;

  const parts: string[] = [];

  if (Array.isArray(detail.fields) && detail.fields.length > 0) {
    parts.push(detail.fields.map((key) => fieldLabel(String(key))).join(", "));
  }

  if (typeof detail.report === "string") {
    parts.push(REPORT_LABELS[detail.report] ?? detail.report);
  }

  if (typeof detail.kind === "string") {
    parts.push(CONSENT_LABELS[detail.kind] ?? detail.kind);
  }

  if (typeof detail.version === "string") parts.push(`metin ${detail.version}`);

  if (detail.channel === "panel") parts.push("panelden kaydedildi");

  if (typeof detail.date === "string") parts.push(detail.date);

  if (typeof detail.branch === "string" && detail.branch) parts.push(detail.branch);

  if (typeof detail.rows === "number") parts.push(`${detail.rows} satır`);

  if (typeof detail.count === "number") parts.push(`${detail.count} not`);

  if (detail.revenue === true) parts.push("ücret sütunuyla");

  return parts.length > 0 ? parts.join(" · ") : null;
}

export const ENTITY_FILTERS = [
  { key: "hepsi", label: "Hepsi", entity: undefined },
  { key: "hasta", label: "Hasta kaydı", entity: "customer" },
  { key: "tibbi", label: "Tıbbi not", entity: "customer_medical_note" },
  { key: "rapor", label: "Rapor", entity: "report" },
] as const;
