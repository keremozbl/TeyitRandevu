/**
 * Türkçe karakterleri doğru çeviren slug üretici.
 *
 * Standart `normalize("NFD")` yaklaşımı ı, ğ, ş için yanlış sonuç verir:
 * "ı" aksanlı bir "i" değildir, ayrı bir harftir. Bu yüzden eşleme tablosu
 * kullanıyoruz. "Özel Diş Kliniği" → "ozel-dis-klinigi"
 */
const TR_MAP: Record<string, string> = {
  ı: "i", İ: "i", ğ: "g", Ğ: "g", ü: "u", Ü: "u",
  ş: "s", Ş: "s", ö: "o", Ö: "o", ç: "c", Ç: "c",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function slugify(input: string): string {
  return input
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Şemadaki `tenants.slug` kısıtıyla aynı kural. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug);
}
