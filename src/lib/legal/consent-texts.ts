/**
 * KVKK aydınlatma metni ve rıza beyanları.
 *
 * Üç şey burada bilinçli olarak ayrı duruyor — üçü hukuken ayrı şeyler
 * (Plan 11.4):
 *
 *   1. **Aydınlatma** bir bilgilendirmedir, rıza değildir. Onayı istenmez;
 *      okutulduğu KAYIT ALTINA alınır.
 *   2. **Açık rıza** özel nitelikli veri (sağlık) için ayrıca alınır. Ayrı
 *      kutu, ayrı kayıt — tek bir "kabul ediyorum"a sığdırılamaz.
 *   3. **Ticari ileti izni** isteğe bağlıdır ve randevu hatırlatmasıyla
 *      karıştırılmaz. Hatırlatma hizmet bilgilendirmesidir, izne bağlı
 *      değildir (CLAUDE.md kural 7).
 *
 * `VERSION` metnin sürümüdür ve rıza kaydına yazılır. Metin değişince sürüm
 * de değişmek ZORUNDA: hangi rızanın hangi metne verildiği sonradan
 * bilinmezse kayıt hukuken bir şey kanıtlamaz. Sürüm değişince eski kayıtlar
 * geçersiz olmaz, yalnız eski metne bağlı kalır.
 *
 * Veri sorumlusu KURUMDUR (klinik), TeyitRandevu veri işleyendir (Plan 11.1).
 * Metin bu yüzden kurum adıyla üretilir.
 *
 * Bu metinler hukuk danışmanı onayından GEÇMEDİ — canlıya çıkmadan önce
 * gözden geçirilecek (docs/CANLIYA-GECIS.md, C bölümü).
 */

import type { Enums } from "@/lib/supabase/types";

export type ConsentKind = Enums<"consent_kind">;

/** Metnin sürümü. Metin değişirse bu da değişir. En fazla 40 karakter. */
export const CONSENT_VERSION = "2026-08-28.1";

/** Verinin durduğu yer — aydınlatmada açıkça söylenmesi gereken bilgi. */
const DATA_REGION = "Almanya (Frankfurt)";

export type ConsentBox = {
  kind: ConsentKind;
  version: string;
  /** Formdaki alan adı — kutu ile `booking_confirm`e giden kayıt aynı yerden */
  field: "onay_aydinlatma" | "onay_saglik" | "onay_ticari";
  /** Onay kutusunun yanındaki tek cümle */
  label: string;
  /** Kutunun altındaki açıklama; niçin isteniyor */
  hint: string;
  required: boolean;
};

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

export type DisclosureText = {
  version: string;
  title: string;
  sections: LegalSection[];
};

/**
 * Randevu formundaki onay kutuları. Sıra ekranda da bu sıradır: önce
 * bilgilendirme, sonra açık rıza, en sonda isteğe bağlı olan.
 */
export function buildConsentBoxes(tenantName: string): ConsentBox[] {
  return [
    {
      kind: "kvkk_aydinlatma",
      version: CONSENT_VERSION,
      field: "onay_aydinlatma",
      label: `${tenantName} tarafından hazırlanan KVKK Aydınlatma Metni'ni okudum.`,
      hint: "Kişisel verilerinizin hangi amaçla işlendiğini anlatan bilgilendirme. Onay değil, okuduğunuzun kaydıdır.",
      required: true,
    },
    {
      kind: "acik_riza_saglik",
      version: CONSENT_VERSION,
      field: "onay_saglik",
      label:
        "Randevu talebimin oluşturulması için seçtiğim hizmete ilişkin sağlık verimin işlenmesine açık rıza veriyorum.",
      hint: `Seçtiğiniz hizmet, sağlık durumunuza dair bir bilgidir ve özel nitelikli kişisel veri sayılır. Bu rıza olmadan randevu talebi internetten oluşturulamaz; telefonla randevu alabilirsiniz. Rızanızı dilediğiniz zaman geri alabilirsiniz. Kayıtlar ${DATA_REGION} bölgesindeki sunucularda tutulur.`,
      required: true,
    },
    {
      kind: "ticari_ileti",
      version: CONSENT_VERSION,
      field: "onay_ticari",
      label: "Kampanya ve tanıtım içerikli ticari elektronik ileti almak istiyorum.",
      hint: "İsteğe bağlıdır, randevunuzu etkilemez. Randevu hatırlatmaları bu izne bağlı değildir: onlar hizmet bilgilendirmesidir ve her durumda gönderilir.",
      required: false,
    },
  ];
}

/**
 * Aydınlatma metninin tam hâli — `/r/<slug>/kvkk` sayfasında yayımlanır.
 * Yapılandırılmış veri olarak duruyor ki hem ekranda hem ileride PDF ya da
 * e-posta ekinde aynı kaynaktan üretilebilsin.
 */
export function buildDisclosureText(
  tenantName: string,
  contact?: { address?: string | null; phone?: string | null },
): DisclosureText {
  const contactLine = [contact?.address, contact?.phone].filter(Boolean).join(" · ");

  return {
    version: CONSENT_VERSION,
    title: "Kişisel Verilerin Korunması Hakkında Aydınlatma Metni",
    sections: [
      {
        heading: "Veri sorumlusu",
        paragraphs: [
          `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verileriniz veri sorumlusu sıfatıyla ${tenantName} tarafından işlenmektedir.`,
          contactLine
            ? `İletişim: ${contactLine}`
            : "İletişim bilgilerine randevu sayfasının alt bölümünden ulaşabilirsiniz.",
          "Randevu sisteminin işletilmesinde TeyitRandevu veri işleyen sıfatıyla hizmet vermekte, verilerinizi yalnızca veri sorumlusunun talimatı doğrultusunda işlemektedir.",
        ],
      },
      {
        heading: "İşlenen kişisel verileriniz",
        paragraphs: ["İnternetten randevu oluştururken aşağıdaki veriler işlenir:"],
        items: [
          "Kimlik ve iletişim: ad soyad, telefon numarası, verdiyseniz e-posta adresiniz",
          "Randevu bilgisi: seçtiğiniz hizmet, tarih ve saat, tercih ettiğiniz hekim, eklediğiniz not",
          "Sağlık verisi: seçtiğiniz hizmetin türü sağlık durumunuza ilişkin bilgi taşır ve özel nitelikli kişisel veri sayılır",
          "İşlem güvenliği: rıza kaydınızın alındığı tarih, IP adresi ve tarayıcı bilgisi",
        ],
      },
      {
        heading: "İşleme amaçları",
        items: [
          "Randevu talebinizin oluşturulması, planlanması ve size teyit edilmesi",
          "Randevunuza dair hatırlatma ve değişiklik bildirimlerinin yapılması",
          "Sağlık hizmetinin sunulması ve hasta kaydınızın tutulması",
          "Mevzuattan doğan saklama, bilgilendirme ve ispat yükümlülüklerinin yerine getirilmesi",
        ],
      },
      {
        heading: "Hukuki sebep",
        paragraphs: [
          "Kimlik ve iletişim verileriniz, sözleşmenin kurulması ve ifası ile veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi hukuki sebeplerine dayanılarak işlenir (KVKK m.5/2).",
          "Sağlık verileriniz, tarafınızdan verilen açık rızaya dayanılarak işlenir (KVKK m.6/2). Açık rızanızı dilediğiniz zaman geri alabilirsiniz; geri alma, o ana kadar yapılmış işlemleri etkilemez.",
          "Ticari elektronik ileti gönderimi, 6563 sayılı Kanun uyarınca ayrıca vereceğiniz onaya bağlıdır. Randevu hatırlatmaları ticari ileti değil hizmet bilgilendirmesidir.",
        ],
      },
      {
        heading: "Aktarım",
        paragraphs: [
          `Verileriniz, randevu sisteminin çalıştırıldığı bulut altyapısı üzerinde ${DATA_REGION} bölgesindeki sunucularda saklanmaktadır. Bu, kişisel verilerin yurt dışına aktarılması anlamına gelir ve KVKK m.9 kapsamında yürütülür.`,
          "Verileriniz, yasal olarak yetkili kamu kurum ve kuruluşları dışında üçüncü kişilerle paylaşılmaz; pazarlama amacıyla satılmaz.",
        ],
      },
      {
        heading: "Saklama süresi",
        paragraphs: [
          "Hasta kayıtları ve tedaviye ilişkin veriler sağlık mevzuatının öngördüğü süreler boyunca; randevu ve ticari kayıtlar ilgili mevzuattaki zamanaşımı süreleri boyunca saklanır. Süre dolduğunda veriler silinir, yok edilir veya anonim hâle getirilir.",
          "Onaylanmayan randevu talepleri, talebin tamamlanmaması hâlinde kısa süre içinde kendiliğinden silinir.",
        ],
      },
      {
        heading: "Haklarınız",
        paragraphs: ["KVKK m.11 uyarınca veri sorumlusuna başvurarak şunları talep edebilirsiniz:"],
        items: [
          "Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme",
          "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme",
          "Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme",
          "Eksik veya yanlış işlenmiş verinin düzeltilmesini isteme",
          "Şartları oluştuğunda verilerin silinmesini veya yok edilmesini isteme",
          "Düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme",
          "İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonuç ortaya çıkmasına itiraz etme",
          "Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme",
        ],
      },
      {
        heading: "Başvuru",
        paragraphs: [
          `Taleplerinizi ${tenantName} adresine yazılı olarak veya Kurul'un belirlediği diğer yöntemlerle iletebilirsiniz. Başvurunuz en geç otuz gün içinde sonuçlandırılır.`,
        ],
      },
    ],
  };
}
