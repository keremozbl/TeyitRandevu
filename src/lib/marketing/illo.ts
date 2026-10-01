/**
 * İllüstrasyon kataloğu.
 *
 * Anahtarlar sektör şablonlarının kendi anahtarları (`src/lib/templates/*.json`)
 * artı ürünün anlattığı iki an: randevu/takvim ve kurulum. Bileşenden ayrı bir
 * dosyada, çünkü hem pazarlama sitesi hem kurulum sihirbazı okuyor ve ikisi
 * farklı route gruplarında.
 *
 * Yeni bir sektör şablonu eklendiğinde buraya bir satır gelmezse
 * `SectorIllustration` randevu görseline düşer — sayfa boş kutu göstermez.
 * Ölçüler dosyaların kendi viewBox'ından; oran kutusu zaten alanı ayırıyor,
 * bunlar yalnızca yedek.
 */

export const ILLO = {
  berber: {
    src: "/illo/berber.svg",
    alt: "Berber koltuğundaki müşterinin saçını kesen usta",
    w: 1144,
    h: 715,
  },
  guzellik_salonu: {
    src: "/illo/guzellik.svg",
    alt: "Koltukta oturan müşteriye bakım uygulayan güzellik uzmanı",
    w: 930,
    h: 802,
  },
  dis_klinigi: {
    src: "/illo/dis-klinigi.svg",
    alt: "Önlükleriyle yan yana duran iki klinisyen",
    w: 693,
    h: 597,
  },
  fizyoterapi: {
    src: "/illo/fizyoterapi.svg",
    alt: "Danışanına egzersiz yaptıran uygulayıcı",
    w: 805,
    h: 651,
  },
  diyetisyen: {
    src: "/illo/diyetisyen.svg",
    alt: "Beslenme listesini anlatan diyetisyen",
    w: 767,
    h: 519,
  },
  psikolog: {
    src: "/illo/psikolog.svg",
    alt: "Birbirine destek olan iki kişi",
    w: 661,
    h: 514,
  },
  randevu: {
    src: "/illo/randevu.svg",
    alt: "Takvimdeki randevuları işaretleyen kişi",
    w: 866,
    h: 606,
  },
  kurulum: {
    src: "/illo/kurulum.svg",
    alt: "Adım adım ilerleyen kurulum kartları",
    w: 960,
    h: 604,
  },
} as const;

export type IlloKey = keyof typeof ILLO;
