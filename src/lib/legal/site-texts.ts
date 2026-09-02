/**
 * Pazarlama sitesinin kendi KVKK metinleri.
 *
 * DİKKAT — burada roller `consent-texts.ts`teki ile YER DEĞİŞTİRİR:
 *
 *   Hasta verisinde:  klinik = veri sorumlusu, TeyitRandevu = veri işleyen
 *   Demo talebinde:   TeyitRandevu = VERİ SORUMLUSU
 *
 * Yani bu metnin arkasında duran biziz. Formu dolduran kişinin adı, e-postası
 * ve mesajı bizim sorumluluğumuzda işleniyor; kayıt da kiracıya bağlı
 * `consents` tablosuna değil, `demo_requests` satırının kendi sütunlarına
 * yazılıyor (85_platform.sql).
 *
 * Metin avukat onayından GEÇMEDİ (docs/CANLIYA-GECIS.md, C bölümü). Sürüm
 * değişince `SITE_NOTICE_VERSION` de değişir: hangi talebin hangi metinle
 * alındığı bilinmezse kayıt bir şey kanıtlamaz.
 */

export const SITE_NOTICE_VERSION = "2026-09-01.1";

/**
 * YAYIN ÖNCESİ DOLDURULACAK. Şirket kurulmadan ve alan adı alınmadan bu
 * değerler gerçek değil; site bu hâliyle yayına alınamaz (CANLIYA-GECIS B11).
 */
export const SITE_CONTACT = {
  legalName: "TeyitRandevu",
  email: "iletisim@teyitrandevu.com",
  address: null as string | null,
  phone: null as string | null,
  dataRegion: "Almanya (Frankfurt)",
} as const;

export type LegalBlock = { heading: string; paragraphs?: string[]; items?: string[] };

/** Form kutusunun yanındaki tek cümle — uzun metin ayrı sayfada. */
export const DEMO_NOTICE_LINE =
  "Bıraktığınız bilgiler yalnızca talebinize dönüş yapmak için kullanılır.";

export const DEMO_MARKETING_LINE =
  "Ürün haberleri ve tanıtım içerikli ileti almak istiyorum.";

export const DEMO_MARKETING_HINT =
  "İsteğe bağlıdır ve talebinizi etkilemez. Talebinize dönüş bu onaya bağlı değildir; o hizmet bilgilendirmesidir.";

export function buildSiteNotice(): { version: string; title: string; sections: LegalBlock[] } {
  const contact = [SITE_CONTACT.email, SITE_CONTACT.address, SITE_CONTACT.phone]
    .filter(Boolean)
    .join(" · ");

  return {
    version: SITE_NOTICE_VERSION,
    title: "Site Ziyaretçileri İçin Aydınlatma Metni",
    sections: [
      {
        heading: "Veri sorumlusu",
        paragraphs: [
          `Bu sitede paylaştığınız kişisel veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca veri sorumlusu sıfatıyla ${SITE_CONTACT.legalName} tarafından işlenir.`,
          contact ? `İletişim: ${contact}` : "İletişim bilgileri iletişim sayfasında yer alır.",
          "Kliniklerin hasta verileri bu metnin kapsamı dışındadır: orada veri sorumlusu ilgili kliniktir, TeyitRandevu yalnızca veri işleyendir. Hastalara yönelik aydınlatma metni her kliniğin kendi randevu sayfasında yayımlanır.",
        ],
      },
      {
        heading: "İşlenen veriler",
        paragraphs: ["Demo talebi formunu doldurduğunuzda:"],
        items: [
          "Kimlik ve iletişim: ad soyad, e-posta adresi, verdiyseniz telefon numarası ve kurum adınız",
          "Talep içeriği: seçtiğiniz iş kolu ve yazdığınız mesaj",
          "İşlem güvenliği: talebin alındığı tarih, IP adresi ve tarayıcı bilgisi",
        ],
      },
      {
        heading: "İşleme amaçları ve hukuki sebep",
        items: [
          "Talebinize dönüş yapılması ve demo görüşmesinin planlanması — sözleşmenin kurulmasından önceki hazırlık aşaması (KVKK m.5/2-c)",
          "Kötüye kullanımın önlenmesi ve kayıtların ispatı — meşru menfaat (KVKK m.5/2-f)",
          "Ayrıca onay verdiyseniz, ürün haberleri ve tanıtım içerikli ileti gönderilmesi — açık rızanız ve 6563 sayılı Kanun uyarınca verdiğiniz onay",
        ],
      },
      {
        heading: "Ticari ileti onayı",
        paragraphs: [
          "Tanıtım içerikli ileti onayı isteğe bağlıdır; vermemeniz talebinizin cevaplanmasını etkilemez. Onayınızı dilediğiniz zaman geri alabilirsiniz; geri alma talebiniz için iletişim adresine yazmanız yeterlidir.",
          "Talebinize verilen cevap ticari ileti değil, hizmete ilişkin bilgilendirmedir ve bu onaya bağlı değildir.",
        ],
      },
      {
        heading: "Aktarım ve saklama",
        paragraphs: [
          `Kayıtlar ${SITE_CONTACT.dataRegion} bölgesindeki bulut sunucularda saklanır; bu, kişisel verilerin yurt dışına aktarılması anlamına gelir ve KVKK m.9 kapsamında yürütülür.`,
          "Talebiniz, görüşme süreci tamamlandıktan sonra makul bir süre daha saklanır; saklama süresi dolduğunda silinir veya anonim hâle getirilir.",
        ],
      },
      {
        heading: "Haklarınız",
        paragraphs: [
          "KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini, silinmesini veya yok edilmesini isteme ve işlemeye itiraz etme haklarına sahipsiniz. Başvurularınız için iletişim adresini kullanabilirsiniz; talebiniz en geç otuz gün içinde cevaplanır.",
        ],
      },
      {
        heading: "Çerezler",
        paragraphs: [
          "Bu site pazarlama ya da izleme çerezi kullanmaz. Ziyaretinizi ölçen üçüncü taraf bir analiz aracı da yüklenmez; bu nedenle çerez onayı istenmez.",
        ],
      },
    ],
  };
}
