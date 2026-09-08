import { getTemplate } from "@/lib/templates";

/**
 * Kurumun sektörüne göre panelde neyin açık olduğu.
 *
 * Kaynak, kurulumda seçilen şablon: `tenants.business_type` şablonun anahtarını
 * tutuyor ve şablon dosyası `modules` listesini taşıyor. Yani "berberde tıbbi
 * not olmasın" kararı kodda değil `berber.json` içinde — yeni bir sektör
 * eklemek hâlâ yalnızca bir JSON dosyası koymak demek (CLAUDE.md).
 *
 * Modül listesi kuruma KOPYALANMIYOR, şablondan okunuyor. Şablonun kendisi
 * kopya olarak çalışıyor (hizmetler, roller, çalışma saatleri kuruma yazılıyor)
 * ama bir modülün varlığı ürünün o sektöre ne sunduğuyla ilgili, kurumun
 * verisiyle değil: ürüne bir ekran eklendiğinde o sektördeki bütün kurumlar
 * görmeli, kurulum tarihine göre bölünmemeli.
 *
 * **Bu bir yetki mekanizması değil.** Yetki RLS'te (CLAUDE.md kural 3); burası
 * yalnızca ilgisiz bir bölümü çizmemeyi sağlıyor. Tıbbi notu asıl koruyan şey
 * `customer_medical_notes` tablosunun kendi politikası.
 */

export type SectorCapabilities = {
  /** Şablonun ilan ettiği modüller; bilinmeyen sektörde boş */
  modules: readonly string[];
  /**
   * Tıbbi not bölümü çizilsin mi.
   *
   * Berberin müşteri kartında "Tıbbi notlar" başlığı görmesi yalnızca gereksiz
   * değil: tıbbi veri KVKK md. 6'da özel nitelikli kişisel veri ve berberin
   * bunu toplamak için hukuki dayanağı yok. Ürünün kutuyu açması, kaydın
   * kendisini davet eder.
   */
  medicalNotes: boolean;
};

const BOS: SectorCapabilities = { modules: [], medicalNotes: false };

export function sectorCapabilities(businessType: string | null | undefined): SectorCapabilities {
  if (!businessType) return BOS;

  const template = getTemplate(businessType);
  // Elle kurulmuş, şablonsuz bir kurum: nötr davran, fazladan bölüm açma.
  if (!template) return BOS;

  return {
    modules: template.modules,
    medicalNotes: template.modules.includes("medical_notes"),
  };
}
