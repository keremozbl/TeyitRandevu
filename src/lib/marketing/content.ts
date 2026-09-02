/**
 * Pazarlama sitesinin içeriği.
 *
 * Metinler JSX'in içine değil buraya yazılıyor: aynı cümle birden çok sayfada
 * geçiyor (paket adları, yetenek başlıkları) ve içerik düzenlemek için düzen
 * kodunu açmak gerekmesin.
 *
 * İKİ DÜRÜSTLÜK KURALI — ikisi de ürünün kendi ahlakının devamı (bkz. `log`
 * sağlayıcısı: göndermediği mesaja "gönderildi" demiyor):
 *
 *   1. **Olmayan şey vaat edilmez.** SMS sağlayıcısı henüz bağlı değil; site
 *      "hatırlatmalar gidiyor" demiyor, "altyapı hazır, sağlayıcı pilotla
 *      bağlanıyor" diyor.
 *   2. **Uydurma kanıt yok.** Müşteri logosu, kullanıcı sayısı, yıldız
 *      puanı, referans yorumu yok — çünkü henüz yok.
 */

export const PRODUCT = {
  name: "TeyitRandevu",
  /** Tek cümlede ne olduğu; meta description ve paylaşım kartı da bunu kullanır */
  summary:
    "Diş klinikleri için randevu, hasta takibi ve hatırlatma sistemi. Günün programı her sabah hazır.",
  stage: "Ürün pilot aşamasında: ilk kliniklerle birlikte kuruluyor.",
} as const;

/**
 * Ana sayfadaki güven şeridi.
 *
 * Rakiplerin yerinde "16.000 işletme", "4.8 yıldız" yazıyor; bizde henüz
 * öyle bir sayı yok ve uydurulmuyor (yukarıdaki iki dürüstlük kuralı). Yerine
 * doğrulanabilir olgular: nerede durduğu, neyin garanti edildiği.
 */
export const TRUST = [
  { label: "Çift rezervasyon", value: "Veritabanı kısıtı" },
  { label: "Veri konumu", value: "AB · Frankfurt" },
  { label: "KVKK", value: "Rıza + denetim kaydı" },
  { label: "Kurulum", value: "Pilotta birlikte, ücretsiz" },
] as const;

export type Capability = {
  key: string;
  title: string;
  /** Bir cümlelik iddia — soyut fayda değil, somut davranış */
  claim: string;
  body: string;
  /** Yanına çizilecek ürün parçası */
  mock: "grid" | "message" | "card" | "booking";
};

export const CAPABILITIES: Capability[] = [
  {
    key: "cakisma",
    title: "Çift rezervasyon imkânsız",
    claim: "Kontrol arayüzde değil, veritabanında.",
    body: "İki kişi aynı saati aynı anda talep ettiğinde biri kabul edilir, diğerine boş saatler önerilir. Bu kural uygulamada değil veritabanında duruyor; panelden, internetten ve ileride telefondan gelen her kayıt aynı kısıta çarpar.",
    mock: "grid",
  },
  {
    key: "hatirlatma",
    title: "Hatırlatma altyapısı",
    claim: "Mesaj hazır, kuyruk çalışıyor, sağlayıcı pilotla bağlanıyor.",
    body: "Şablon, zamanlama ve kuyruk hazır. Ticari ileti ile hizmet bilgilendirmesi ayrı etiketleniyor: randevu hatırlatması izne bağlı değil, kampanya mesajı İYS onayı olmadan gönderilemiyor ve bu kural veritabanında uygulanıyor.",
    mock: "message",
  },
  {
    key: "yetki",
    title: "Resepsiyon tedavi notunu görmez",
    claim: "Yetki satır seviyesinde, düğme gizleyerek değil.",
    body: "Hekim, asistan, resepsiyon ve muhasebe ayrı yetkilerle çalışır. Tıbbi not ayrı bir tabloda ve ayrı politikayla duruyor — yetkisi olmayan kullanıcı için sorgu boş döner, arayüzde gizlenmiş bir veri yok.",
    mock: "card",
  },
  {
    key: "online",
    title: "Hastanın kendi aldığı randevu",
    claim: "Kliniğin adresinde, KVKK rızasıyla birlikte.",
    body: "Hasta boş saatleri görür, seçer, formu doldururken slot ona ayrılır. Aydınlatma ve açık rıza ayrı kutularda alınır; metnin sürümü, tarih ve kanal kayda geçer. Online gelen randevu onaylı sayılmaz, panelde onay bekler.",
    mock: "booking",
  },
];

/** KVKK bölümü: iddia değil, tutulan kayıtların listesi. */
export const COMPLIANCE = [
  {
    title: "Aydınlatma ve açık rıza ayrı ayrı",
    body: "Tek bir onay kutusu değil: bilgilendirme, sağlık verisi açık rızası ve ticari ileti izni ayrı kayıtlar. Metnin sürümü saklanır, hasta rızasını geri aldığında yeni satır yazılır ve kampanya mesajı o anda durur.",
  },
  {
    title: "Denetim kaydı",
    body: "Hasta kartını kimin ne zaman açtığı, tıbbi notu kimin okuduğu, programı kimin dışa aktardığı kayda geçer. Kaydı yazan kişi onu değiştiremez ve silemez.",
  },
  {
    title: "Tıbbi veri ayrı tabloda",
    body: "Tedavi notu, randevu kaydından ayrı bir tabloda ve ayrı politikayla tutulur. Randevuyu gören her rol tedavi notunu görmez.",
  },
  {
    title: "Veri Frankfurt'ta",
    body: "Kayıtlar Avrupa Birliği bölgesindeki sunucularda tutulur. Bu bir yurt dışı aktarımdır ve KVKK m.9 kapsamında yürütülür; sözleşme seti pilot öncesi tamamlanır.",
  },
] as const;

/* -----------------------------------------------------------------------------
 * Paketler
 *
 * TASLAK. Fiyatlar TEMSİLİDİR ve paket içerikleri henüz kararlaştırılmadı;
 * `PRICING_IS_DRAFT` true olduğu sürece sayfa bunu açıkça söyler. Gerçek
 * fiyat belirlenince bayrak kapatılır.
 *
 * Özellikler burada satır satır duruyor ki ileride `plan_features` tablosuna
 * bire bir taşınabilsin. **Şu an hiçbir yerde uygulanmıyor:** paketin
 * özelliği kapatması, faturalama modülüyle birlikte gelecek.
 * -------------------------------------------------------------------------- */

export const PRICING_IS_DRAFT = true;

/**
 * Aylık ücret metni.
 *
 * `style: "currency"` ₺ (U+20BA) basıyor; arayüz fontunda o glif yok, tarayıcı
 * yedek fonta düşüyor ve sonuç ekranda £ gibi okunuyor — fiyat sayfasında
 * kabul edilemez bir yanlış anlama. Sayı yine Intl ile biçimleniyor (binlik
 * ayracı nokta), para birimi düz metin "TL".
 */
const priceNumber = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function formatMonthly(amount: number): string {
  return `${priceNumber.format(amount)} TL`;
}

export type Plan = {
  key: string;
  name: string;
  /** Kime uygun olduğu — paket adı tek başına anlatmıyor */
  fit: string;
  monthly: number | null;
  highlight?: boolean;
  includes: string[];
  limits: { label: string; value: string }[];
};

export const PLANS: Plan[] = [
  {
    key: "tek_hekim",
    name: "Tek Hekim",
    fit: "Tek hekimin çalıştığı muayenehane.",
    monthly: 890,
    includes: [
      "Takvim, randevu ve hasta kartı",
      "Günün programı: ekran, A4 çıktı, Excel",
      "Online randevu sayfası",
      "KVKK rıza kaydı ve denetim kaydı",
    ],
    limits: [
      { label: "Kullanıcı", value: "2" },
      { label: "Hekim / ünit", value: "1" },
      { label: "Aylık hatırlatma", value: "500" },
    ],
  },
  {
    key: "klinik",
    name: "Klinik",
    fit: "Birden çok hekim ve resepsiyonun birlikte çalıştığı klinik.",
    monthly: 1890,
    highlight: true,
    includes: [
      "Tek Hekim paketindeki her şey",
      "Rol ve yetki düzenleme, hekim bazlı kapsam",
      "Tıbbi not ayrımı ve esnek hasta alanları",
      "Bildirim akışları ve şablon düzenleme",
      "Bekleme listesi",
    ],
    limits: [
      { label: "Kullanıcı", value: "10" },
      { label: "Hekim / ünit", value: "6" },
      { label: "Aylık hatırlatma", value: "3.000" },
    ],
  },
  {
    key: "zincir",
    name: "Zincir",
    fit: "Birden çok şubesi olan kurumlar.",
    monthly: null,
    includes: [
      "Klinik paketindeki her şey",
      "Çok şube, şube bazlı yetki ve raporlar",
      "Kendi SMS sözleşmenizi bağlama",
      "Öncelikli destek ve kurulum",
    ],
    limits: [
      { label: "Kullanıcı", value: "sınırsız" },
      { label: "Şube", value: "sınırsız" },
      { label: "Aylık hatırlatma", value: "kullanım kadar" },
    ],
  },
];

export const FAQ = [
  {
    q: "Hatırlatma mesajları gerçekten gidiyor mu?",
    a: "Henüz hayır. Mesajı üreten, zamanlayan ve kuyruğa yazan altyapı çalışıyor; gönderen operatör sözleşmesi pilot kurumla birlikte yapılıyor. Panelde her satır gönderilip gönderilmediğini açıkça söylüyor — göndermediğimiz mesaja 'gönderildi' demiyoruz.",
  },
  {
    q: "Verilerimiz nerede tutuluyor?",
    a: "Avrupa Birliği bölgesindeki (Frankfurt) sunucularda. Bu KVKK anlamında yurt dışına aktarımdır; gerekli sözleşme ve bildirim süreci pilot öncesinde tamamlanır.",
  },
  {
    q: "Mevcut hasta kayıtlarımızı taşıyabilir miyiz?",
    a: "Pilot kurulumunda birlikte yapıyoruz. Excel ya da mevcut programınızdan çıkardığınız listeyi aktarıyoruz; randevu geçmişi de taşınabilir.",
  },
  {
    q: "İnternetten randevu almak zorunda mıyız?",
    a: "Hayır. Online randevu sayfası kapatılabilir; klinik yalnızca panelden randevu vermeye devam eder. Açtığınızda gelen randevular onay bekleyen olarak düşer, otomatik onaylanmaz.",
  },
  {
    q: "Kaç kullanıcı ekleyebiliriz?",
    a: "Pakete göre değişiyor. Hekim, asistan, resepsiyon ve muhasebe için hazır roller var; her rolün yetkisi kurum içinde düzenlenebiliyor.",
  },
] as const;
