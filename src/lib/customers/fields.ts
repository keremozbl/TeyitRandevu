/**
 * Sektör şablonundan gelen esnek alanların saf mantığı.
 *
 * Diş kliniğinde bir hasta kartı TCKN, kan grubu, kronik hastalık, ilaç
 * alerjisi taşır; berberde bunların hiçbiri yoktur. Alanlar `field_definitions`
 * satırlarıdır, değerler `customers.custom_data` jsonb'sinde durur.
 *
 * Buradaki her şey saf: veritabanı da tarayıcı da bilinmez. Sebep, jsonb'nin
 * şemasız oluşu — değer her zaman beklenen tipte gelmez ve gelmediğinde
 * hasta kartı çökmemeli, o alan boş görünmeli.
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "phone";

/** jsonb'ye yazılabilen değerler; alan türlerinin ürettiği tek küme bu. */
export type FieldValue = string | number | boolean | string[];

export type FieldDefinition = {
  key: string;
  label: string;
  kind: FieldKind;
  isRequired: boolean;
  isMedical: boolean;
  /** Seçeneklerin normalleştirilmiş hâli */
  options: { value: string; label: string }[];
};

/**
 * Seçenekler iki biçimde geliyor: şablon düz metin dizisi yazıyor
 * (`["A Rh+", ...]`), şema yorumu ise nesne öneriyor (`[{value,label}]`).
 * İkisi de kabul edilir; tanımayan değer atılır.
 */
export function parseOptions(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { value: string; label: string }[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const value = item.trim();
      if (value) out.push({ value, label: value });
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const value = typeof record.value === "string" ? record.value.trim() : "";
      if (!value) continue;
      const label = typeof record.label === "string" && record.label.trim() ? record.label : value;
      out.push({ value, label });
    }
  }
  return out;
}

/** Tıbbi alanlar ayrı izne tabidir; yetkisi olmayan onları hiç görmez. */
export function visibleFields(
  definitions: FieldDefinition[],
  canReadMedical: boolean,
): FieldDefinition[] {
  return canReadMedical ? definitions : definitions.filter((field) => !field.isMedical);
}

/** `custom_data` içindeki ham değeri okunur metne çevirir; boşsa null. */
export function formatFieldValue(field: FieldDefinition, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  switch (field.kind) {
    case "boolean":
      return raw === true || raw === "true" ? "Evet" : "Hayır";

    case "multiselect": {
      const values = Array.isArray(raw) ? raw : [raw];
      const labels = values
        .filter((value): value is string => typeof value === "string" && value !== "")
        .map((value) => labelOf(field, value));
      return labels.length > 0 ? labels.join(", ") : null;
    }

    case "select":
      return typeof raw === "string" ? labelOf(field, raw) : null;

    case "date": {
      if (typeof raw !== "string") return null;
      // Sadece gerçek bir tarihse biçimlendir; bozuk değer ham hâliyle görünsün
      const parsed = new Date(`${raw}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return raw;
      return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", dateStyle: "medium" }).format(parsed);
    }

    case "number":
      return typeof raw === "number" ? new Intl.NumberFormat("tr-TR").format(raw) : String(raw);

    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

function labelOf(field: FieldDefinition, value: string): string {
  return field.options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Form gönderisini `custom_data` jsonb'sine çevirir.
 *
 * Boş bırakılan alan anahtarı hiç yazılmaz — `{"tckn": ""}` ile `{}` arasında
 * fark yok, ikincisi dürüst. Tanımsız anahtar da kabul edilmez: form ne
 * gönderirse göndersin, yalnızca kurumun tanımladığı alanlar yazılır.
 */
export function customDataFrom(
  definitions: FieldDefinition[],
  read: (key: string) => string | string[] | null,
): Record<string, FieldValue> {
  const data: Record<string, FieldValue> = {};

  for (const field of definitions) {
    const raw = read(field.key);

    if (field.kind === "multiselect") {
      const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
        .map((value) => value.trim())
        .filter((value) => value !== "" && allowed(field, value));
      if (values.length > 0) data[field.key] = values;
      continue;
    }

    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

    if (field.kind === "boolean") {
      // İşaretlenmemiş kutu gönderilmez; "hayır" ile "cevaplanmadı" aynı şey
      if (value) data[field.key] = true;
      continue;
    }

    if (!value) continue;

    if (field.kind === "number") {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) data[field.key] = parsed;
      continue;
    }

    // Çoklu seçim yukarıda döndü; burada seçenek listesi olan tek tür select
    if (field.kind === "select" && !allowed(field, value)) continue;

    data[field.key] = value;
  }

  return data;
}

/** Seçenek listesi varsa dışından değer kabul edilmez. */
function allowed(field: FieldDefinition, value: string): boolean {
  if (field.options.length === 0) return true;
  return field.options.some((option) => option.value === value);
}

/**
 * Doğum tarihinden yaş. Hasta kartında yaş, tarihten daha çok işe yarıyor —
 * doz ve tedavi kararı yaşa bakar.
 */
export function ageFrom(birthDate: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const nowYear = today.getUTCFullYear();
  const nowMonth = today.getUTCMonth() + 1;
  const nowDay = today.getUTCDate();

  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
