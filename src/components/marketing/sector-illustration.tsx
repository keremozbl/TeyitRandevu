import { ILLO, type IlloKey } from "@/lib/marketing/illo";

/**
 * Sektör ve ürün anı illüstrasyonları.
 *
 * Kaynak: unDraw (undraw.co). Lisansı ticari kullanıma atıfsız izin veriyor;
 * yine de kaynağı `public/illo/README.md` içinde kayıt altında tutuyoruz.
 *
 * Elle çizilmiş SVG sahnelerinin yerini aldılar. Sebep: yedi sahneyi kod
 * içinde çizmek tutarlı bir SİSTEM üretti ama çizim kalitesi üretmedi —
 * gerçek eller, kumaş kırışığı, oturmuş oranlar koordinat tahmin ederek
 * çıkmıyor.
 *
 * Tutarlılık boyamayla sağlanıyor, seçimle değil: unDraw'ın kataloğu birden
 * çok dönemden geliyor ve paletleri tutmuyor (berber beş renk, güzellik salonu
 * on altı mor-pembe ton). Hepsi tek palete indirgendi — koyu giysi, ikincil
 * koyu, iki gri, iki ten tonu — böylece berberle diş kliniği aynı dilden
 * konuşuyor. Dönüşüm `scripts/illo.mjs` içinde ve tekrar çalıştırılabilir.
 *
 * Koyu tema: bu çizimlerin figürleri neredeyse siyah, koyu zeminde kaybolurlar.
 * Bu yüzden panel HER İKİ TEMADA DA AÇIK kalıyor (`--illo-panel`); koyu temada
 * tonu kısılıyor ki ekranda parlamasın. Çizimi tema ile ters çevirmek düz
 * illüstrasyonlarda temiz sonuç vermiyor — gri kademeleri birbirine giriyor.
 */

export function SectorIllustration({
  sector,
  className = "",
  priority = false,
}: {
  sector: string;
  className?: string;
  /** Ekranın üstündeyse: tarayıcı geç yüklemesin */
  priority?: boolean;
}) {
  const illo = ILLO[sector as IlloKey] ?? ILLO.randevu;

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-lg border border-brand-line bg-[var(--illo-panel)] p-6 sm:p-8 ${className}`}
    >
      {/*
        `next/image` yerine düz `<img>`: dosyalar SVG ve optimize edilecek bir
        şey yok — Next SVG'yi zaten dönüştürmüyor, araya girmesi tek kazanç
        getirmeden bir katman ekliyor.

        Oran kutuyu SABİTLİYOR (`aspect-*`), bu yüzden yüklenirken sayfa
        zıplamıyor; yine de `width`/`height` yazılı, çünkü kutu kırılırsa
        tarayıcının elinde bir ölçü kalsın.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG: next/image
          onu zaten dönüştürmüyor, araya girmesi kazanç getirmiyor */}
      <img
        src={illo.src}
        alt={illo.alt}
        width={illo.w}
        height={illo.h}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="h-full max-h-[15rem] w-full object-contain"
      />
    </div>
  );
}
