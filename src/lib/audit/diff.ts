/**
 * Değişen alanların ADLARINI çıkarır — değerlerini değil.
 *
 * Denetim kaydına "telefon ve doğum tarihi değişti" yazmak, kimin neye
 * dokunduğunu göstermeye yeter. Eski ve yeni değeri yazmak, hasta verisinin
 * ikinci bir kopyasını farklı erişim kurallarına sahip bir tabloya taşırdı
 * (KVKK veri asgariliği).
 *
 * Esnek alanlar `alan:<anahtar>` biçiminde işaretlenir: kurumun kendi tanımladığı
 * alan adı sütun adıyla karışmasın.
 */

export type FieldMap = Record<string, unknown>;

/** "Değer yok"un üç hâli: form boş alanı `""`, veritabanı `null`, nesne `undefined` verir. */
function empty(value: unknown): boolean {
  return value == null || value === "";
}

/** İki değerin denk olup olmadığı. Dizi ve nesneler sıraya duyarlı karşılaştırılır. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (empty(a) && empty(b)) return true;
  if (empty(a) || empty(b)) return false;
  if (typeof a !== "object" && typeof b !== "object") return String(a) === String(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function changedFields(before: FieldMap, after: FieldMap): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    if (!same(before[key], after[key])) changed.push(key);
  }
  return changed;
}

/**
 * Esnek alanların (`custom_data`) değişenleri. Yalnızca `after` içindeki
 * anahtarlara bakılır: görme yetkisi olmayan kullanıcının formu, göremediği
 * tıbbi alanı hiç göndermez ve o alan "silindi" sayılmamalıdır — actions.ts
 * o değerleri zaten geri koyuyor.
 */
export function changedCustomFields(before: FieldMap, after: FieldMap): string[] {
  return changedFields(before, after).map((key) => `alan:${key}`);
}
