/**
 * Şablon değişkenlerinin çözülmesi ve mesaj metninin üretilmesi.
 *
 * Saf ve senkron: `Date.now()` yok, veritabanı yok, `process.env` yok. Kuyruk
 * satırındaki `payload` ne diyorsa metin odur — mesaj GÖNDERİM anında değil
 * KUYRUĞA GİRERKEN donmuş bir gerçeği anlatır (80_notifications).
 *
 * Tarih ve saat burada biçimlenir, SQL'de değil: Türkçe tarih `Intl` işidir
 * (CLAUDE.md kural 6). Veritabanı ham anı ve zaman dilimini taşır.
 */

/** Kuyruk satırındaki `payload` — SQL'in yazdığı ham alanlar. */
export type NotificationPayload = {
  musteri_adi?: string | null;
  kurum_adi?: string | null;
  sube_adi?: string | null;
  sube_adresi?: string | null;
  sube_telefon?: string | null;
  hekim_adi?: string | null;
  hizmet_adi?: string | null;
  /** ISO 8601, UTC */
  baslangic?: string | null;
  bitis?: string | null;
  zaman_dilimi?: string | null;
  /** Public randevu sayfasının yolu: /r/<slug>/randevu/<token> */
  randevu_yolu?: string | null;
};

/**
 * Şablon yazarken kullanılabilecek değişkenler. Arayüz bu listeyi gösterir —
 * kullanıcı hangi değişkenin var olduğunu tahmin etmek zorunda kalmasın.
 */
export const TEMPLATE_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "musteri_adi", label: "Müşteri / hasta adı", example: "Ayşe Yılmaz" },
  { key: "kurum_adi", label: "Kurum adı", example: "Demo Diş Kliniği" },
  { key: "sube_adi", label: "Şube adı", example: "Merkez" },
  { key: "sube_adresi", label: "Şube adresi", example: "Bağdat Cad. No 1" },
  { key: "sube_telefon", label: "Şube telefonu", example: "0216 111 22 33" },
  { key: "hekim_adi", label: "Uzman / personel", example: "Dt. Ayla Demir" },
  { key: "hizmet_adi", label: "İşlem", example: "Dolgu" },
  { key: "tarih", label: "Randevu tarihi", example: "31 Ağustos 2026" },
  { key: "gun", label: "Randevu günü", example: "Pazartesi" },
  { key: "saat", label: "Randevu saati", example: "09:00" },
  { key: "randevu_baglantisi", label: "Randevu bağlantısı", example: "https://…/r/klinik/randevu/…" },
];

/**
 * Süslü parantez içindeki HER ŞEY değişken sayılır — yalnız `[a-z_]` değil.
 *
 * Sebebi Türkçe klavye: `{{musterı_adi}}` (noktasız ı) dar bir kalıba
 * uymadığı için hiç tanınmaz ve hastaya giden SMS'te olduğu gibi görünürdü.
 * Geniş kalıpta yazım hatası da yakalanır, `missing` listesine düşer ve
 * arayüz şablonu kaydetmeden önce uyarır.
 */
const VARIABLE_RE = /\{\{([^{}]{0,60}?)\}\}/g;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Metne konacak değerler. Eksik alan boş string döner — şablonda `{{hekim_adi}}`
 * geçiyorsa ve randevuda kaynak adı yoksa mesaj "Sayın Ayşe, randevunuz"
 * diye devam eder, `undefined` yazmaz.
 */
export function buildVariables(
  payload: NotificationPayload,
  options: { siteUrl?: string } = {},
): Record<string, string> {
  const timeZone = text(payload.zaman_dilimi) || "Europe/Istanbul";
  const startsAt = payload.baslangic ? new Date(payload.baslangic) : null;
  const valid = startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null;

  const day = valid
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone,
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(valid)
    : "";
  const weekday = valid
    ? new Intl.DateTimeFormat("tr-TR", { timeZone, weekday: "long" }).format(valid)
    : "";
  const clock = valid
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(valid)
    : "";

  const path = text(payload.randevu_yolu);
  const base = (options.siteUrl ?? "").replace(/\/+$/, "");

  return {
    musteri_adi: text(payload.musteri_adi),
    kurum_adi: text(payload.kurum_adi),
    sube_adi: text(payload.sube_adi),
    sube_adresi: text(payload.sube_adresi),
    sube_telefon: text(payload.sube_telefon),
    hekim_adi: text(payload.hekim_adi),
    hizmet_adi: text(payload.hizmet_adi),
    tarih: day,
    gun: weekday,
    saat: clock,
    randevu_baglantisi: path ? `${base}${path}` : "",
  };
}

export type RenderResult = {
  text: string;
  /** Şablonda geçen ama karşılığı olmayan değişkenler — arayüz uyarır */
  missing: string[];
};

/**
 * `{{degisken}}` yerine değerini koyar.
 *
 * Tanınmayan değişken metinde BOŞ bırakılır ama sessizce yutulmaz: adı
 * `missing` içinde döner. Şablonu yazan kişi yazım hatasını göndermeden
 * önce görsün — hastaya giden mesajda `{{musterı_adi}}` yazması, boş
 * bırakılmasından daha kötü.
 */
export function renderTemplate(body: string, variables: Record<string, string>): RenderResult {
  const missing: string[] = [];

  const rendered = body.replace(VARIABLE_RE, (_match, raw: string) => {
    const name = raw.trim();
    if (name === "") return "";

    const value = variables[name];
    if (value === undefined) {
      if (!missing.includes(name)) missing.push(name);
      return "";
    }
    if (value === "") {
      if (!missing.includes(name)) missing.push(name);
    }
    return value;
  });

  // Boş kalan değişken arkasında çift boşluk ve noktalama önünde boşluk
  // bırakır ("Sayın , hoş geldiniz"). Eksik veri mesajı bozuk göstermesin.
  const clean = rendered
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();

  return { text: clean, missing };
}

/**
 * SMS parça sayısı ve maliyeti.
 *
 * Türkçe için kritik: `ğ`, `ı`, `ş` GSM-7 alfabesinde YOK. Bu harflerden biri
 * geçen mesaj UCS-2'ye düşer ve parça 160 değil 70 karakter olur — yani aynı
 * metin iki katı fiyata gider. Şablon ekranı bunu yazarken göstermeli, fatura
 * geldiğinde değil.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export function isGsm7(value: string): boolean {
  return [...value].every((char) => GSM7.includes(char) || GSM7_EXTENDED.includes(char));
}

export function smsSegments(value: string): { segments: number; encoding: "gsm7" | "ucs2" } {
  if (value.length === 0) return { segments: 0, encoding: "gsm7" };

  if (isGsm7(value)) {
    // Genişletilmiş tablodaki karakterler iki yer kaplar
    const length = [...value].reduce(
      (sum, char) => sum + (GSM7_EXTENDED.includes(char) ? 2 : 1),
      0,
    );
    const segments = length <= 160 ? 1 : Math.ceil(length / 153);
    return { segments, encoding: "gsm7" };
  }

  const length = [...value].length;
  return { segments: length <= 70 ? 1 : Math.ceil(length / 67), encoding: "ucs2" };
}
