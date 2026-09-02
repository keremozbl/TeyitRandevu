import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { MOCKS } from "@/components/marketing/product-mocks";
import { Reveal } from "@/components/marketing/reveal";
import { SectorCarousel } from "@/components/marketing/sector-carousel";
import {
  BODY,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Container,
  Eyebrow,
  GridTexture,
  H1,
  H2,
  H3,
  LEAD,
} from "@/components/marketing/ui";
import { listSectorSlides } from "@/lib/marketing/sectors";
import {
  CAPABILITIES,
  CHANNELS,
  COMPARISON,
  COMPLIANCE,
  FAQ,
  formatMonthly,
  PLANS,
  PRICING_IS_DRAFT,
  PRODUCT,
  START_STEPS,
  TRUST,
} from "@/lib/marketing/content";

export const metadata: Metadata = {
  // `absolute`: ana sayfa kök layout'taki "%s · TeyitRandevu" şablonunu
  // kullanmaz, yoksa başlık "TeyitRandevu … · TeyitRandevu" olurdu.
  title: {
    absolute: "TeyitRandevu · Klinik, salon ve danışmanlık için randevu sistemi",
  },
  description: PRODUCT.summary,
};

export default function AnaSayfa() {
  return (
    <div className="flex flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-border">
        <GridTexture />
        <Container className="relative grid gap-12 pb-16 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-16">
          <div className="flex max-w-xl flex-col gap-6">
            {/* Hero bir kez oynayan kademeli bir giriş: döngü yok, durdurma
                denetimi gerekmiyor; prefers-reduced-motion süreyi sıfırlıyor. */}
            <p className="animate-[giris-saga_620ms_cubic-bezier(0.22,0.61,0.36,1)_both] border-l-2 border-brand pl-3 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-2">
              Klinik · Salon · Danışmanlık · pilot aşaması
            </p>

            <h1 className={`${H1} animate-[giris-yukari_620ms_cubic-bezier(0.22,0.61,0.36,1)_both]`} style={{ animationDelay: "80ms" }}>
              Randevular <span className="text-brand">çakışmasın</span>, kimse gelmeyi unutmasın.
            </h1>

            <p className={`${LEAD} animate-[giris-yukari_620ms_cubic-bezier(0.22,0.61,0.36,1)_both]`} style={{ animationDelay: "160ms" }}>
              Takvim, müşteri kartı ve hatırlatma tek yerde. Günün programı her sabah hazır
              çıkar; aynı saate iki kişi yazılması uygulamada değil, veritabanında engellenir.
            </p>

            <div
              className="flex flex-wrap items-center gap-3 animate-[giris-yukari_620ms_cubic-bezier(0.22,0.61,0.36,1)_both]"
              style={{ animationDelay: "240ms" }}
            >
              <Link href="/demo" className={BTN_PRIMARY}>
                Demoyu deneyin
              </Link>
              <Link href="/iletisim" className={BTN_SECONDARY}>
                Pilot için görüşelim
              </Link>
            </div>

            <ul
              className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3 animate-[giris-yukari_620ms_cubic-bezier(0.22,0.61,0.36,1)_both]"
              style={{ animationDelay: "320ms" }}
            >
              {["Kayıt istemez", "Sektörünüze göre hazır kurulum", "Eğitim pilotta ücretsiz"].map(
                (item, index) => (
                  <li key={item} className="flex items-center gap-4">
                    {index > 0 && <span aria-hidden="true" className="h-3 w-px bg-border-strong" />}
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Eğik perspektif yok: ürün ekranı okunacak, dekor değil. */}
          <div className="animate-[giris-yukari_620ms_cubic-bezier(0.22,0.61,0.36,1)_both] lg:pl-4" style={{ animationDelay: "200ms" }}>
            <div className="rounded-lg border border-border bg-surface p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-24px_rgba(0,0,0,0.35)]">
              <MOCKS.grid />
            </div>
            <p className="pt-3 text-center text-[12px] text-ink-3">
              Ürünün kendi arayüzü — ekran görüntüsü değil, aynı token’larla çizildi
            </p>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------- güven şeridi */}
      <section aria-label="Öne çıkan bilgiler" className="border-b border-border bg-surface">
        <Container>
          <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
            {TRUST.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col gap-1 py-5 sm:px-6 sm:first:pl-0">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                  {item.label}
                </dt>
                <dd className="text-[15px] font-medium text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ------------------------------------------------------ günün programı */}
      <section className="border-b border-border">
        <Container className="grid gap-10 py-16 lg:grid-cols-2 lg:items-start lg:gap-16">
          <Reveal className="flex max-w-xl flex-col gap-5">
            <Eyebrow index="01">Sabah 08.40</Eyebrow>
            <h2 className={H2}>Günün programını elle hazırlamak</h2>
            <p className={LEAD}>
              Çoğu işletmede gün, defterden Excel’e satır taşıyarak başlıyor: kim kime bakacak,
              hangi işlem, kim gelmedi. Yirmi dakika sürüyor, bir randevu atlandığında kimse fark
              etmiyor ve öğlen değişen bir saat listeye hiç yansımıyor.
            </p>
            <p className={BODY}>
              TeyitRandevu’da o liste bir çıktı: ekranda görünür, A4 olarak yazdırılır, Excel olarak
              indirilir. Üçü de aynı veriden üretilir, yani biri güncelken diğeri eski olamaz.
            </p>
            <ul className="flex flex-col gap-2.5 pt-1">
              {[
                "Uzman uzman ayrılmış, saat sırasına dizilmiş",
                "İptal ve gelmeyen ayrı sayılır, listeyi kirletmez",
                "Ücret sütunu yalnızca yetkisi olana görünür",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-ink">
                  <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="lg:pt-10">
            <ProgramMock />
          </Reveal>
        </Container>
      </section>

      {/* --------------------------------------------------------------- ürün */}
      <section id="urun" className="scroll-mt-24 border-b border-border">
        <Container className="py-16">
          <Reveal className="flex max-w-xl flex-col gap-4 pb-12">
            <Eyebrow index="02">Ürün</Eyebrow>
            <h2 className={H2}>Randevuyu yazmaktan gün sonuna, tek ekranda</h2>
            <p className={LEAD}>
              Kim ne zaman gelecek, kim hatırlatıldı, kim gelmedi, kartında ne yazıyor — hepsi
              aynı yerde. Aşağıdaki ekranlar ürünün kendisinden: çizim değil, aynı arayüzün
              parçaları.
            </p>
          </Reveal>

          <div className="flex flex-col gap-14">
            {CAPABILITIES.map((capability, index) => {
              const Mock = MOCKS[capability.mock];
              return (
                <Reveal
                  key={capability.key}
                  as="article"
                  delay={index * 60}
                  className="grid gap-8 border-t border-border pt-10 lg:grid-cols-2 lg:items-center lg:gap-14"
                >
                  <div
                    className={`flex max-w-xl flex-col gap-3 ${index % 2 === 1 ? "lg:order-2" : ""}`}
                  >
                    <p data-numeric className="font-mono text-[13px] text-brand">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className={H3}>{capability.title}</h3>
                    <p className="text-[15px] font-medium text-brand">{capability.claim}</p>
                    <p className={BODY}>{capability.body}</p>
                  </div>
                  <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                    <Mock />
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Kanallar: rakiplerin rozet dizdiği yer. Bizde durum da yazıyor. */}
          <Reveal className="mt-14 border-t border-border pt-8">
            <h3 className="pb-5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-3">
              Hasta size hangi yoldan ulaşıyor, siz ona hangi yoldan
            </h3>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {CHANNELS.map((channel) => (
                <li key={channel.name} className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[15px] font-medium text-ink">{channel.name}</span>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                        channel.state === "hazır"
                          ? "bg-st-confirmed-soft text-st-confirmed"
                          : channel.state === "planlı"
                            ? "bg-surface-2 text-ink-3"
                            : "bg-st-pending-soft text-st-pending"
                      }`}
                    >
                      {channel.state}
                    </span>
                  </p>
                  <p className="text-[14px] leading-relaxed text-ink-2">{channel.detail}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      {/* ----------------------------------------------------------- sektörler */}
      <section id="sektorler" className="scroll-mt-24 border-b border-border">
        <Container className="py-16">
          <Reveal className="flex max-w-2xl flex-col gap-4 pb-10">
            <Eyebrow index="03">Sektörler</Eyebrow>
            <h2 className={H2}>Sektörünüz kurulu geliyor</h2>
            <p className={LEAD}>
              Şablon yalnızca hizmet listesi değil: işletmenin dilini de getiriyor. Kimine
              “hasta”, kimine “danışan”, kimine “müşteri” denir; kimi “hekim”, kimi “usta”
              çalıştırır. Kurulumda sektörü seçtiğinizde hizmet süreleri, tamponlar, roller,
              müşteri alanları ve mesaj şablonları birlikte geliyor — hepsi sonradan
              değiştirilebilir.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <SectorCarousel slides={listSectorSlides()} />
          </Reveal>

          <p className="max-w-2xl pt-8 text-[15px] leading-[1.7] text-ink-2">
            <strong className="font-medium text-ink">Listede yoksa da olur.</strong> Motor sektöre
            bağlı değil: kurulumda işinizi konuşup hizmetleri, süreleri, alanları ve mesajları
            birlikte tanımlıyoruz. Kurduğumuz her yeni sektör bir sonraki işletme için hazır
            şablona dönüşüyor.
          </p>
        </Container>
      </section>

      {/* ------------------------------------------------------- karşılaştırma */}
      <section className="border-b border-border">
        <Container className="py-16">
          <Reveal className="flex max-w-2xl flex-col gap-4 pb-10">
            <Eyebrow index="04">Bugünkü düzen</Eyebrow>
            <h2 className={H2}>Rakibimiz başka bir program değil, defter ve Excel</h2>
            <p className={LEAD}>
              Çoğu işletme bugün randevuyu deftere, listeyi Excel’e yazıyor. İkisi de çalışıyor —
              ta ki iki kişi aynı saate yazılana, biri gelmeyene ya da bir kayıt kaybolana kadar.
            </p>
          </Reveal>

          <Reveal delay={80} className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-1/5 py-3 pr-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                    Konu
                  </th>
                  <th scope="col" className="w-2/5 py-3 pr-4 text-[14px] font-medium text-ink-2">
                    Defter ve Excel
                  </th>
                  <th scope="col" className="w-2/5 py-3 text-[14px] font-medium text-brand">
                    TeyitRandevu
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARISON.map((row) => (
                  <tr key={row.topic}>
                    <th scope="row" className="py-4 pr-4 align-top text-[14px] font-medium text-ink">
                      {row.topic}
                    </th>
                    <td className="py-4 pr-4 align-top text-[14px] leading-relaxed text-ink-3">
                      {row.before}
                    </td>
                    <td className="py-4 align-top text-[14px] leading-relaxed text-ink">
                      {row.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </Container>
      </section>

      {/* -------------------------------------------------------------- fiyat */}
      <section className="border-b border-border bg-surface-2">
        <Container className="py-16">
          <div className="flex flex-wrap items-end justify-between gap-6 pb-10">
            <div className="flex max-w-xl flex-col gap-4">
              <Eyebrow index="05">Paketler</Eyebrow>
              <h2 className={H2}>İşletme büyüdükçe artan tek şey yetki derinliği</h2>
            </div>
            <Link href="/fiyat" className={`${BTN_SECONDARY} shrink-0`}>
              Paketleri karşılaştırın
            </Link>
          </div>

          <ul className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan, index) => (
              <Reveal
                key={plan.key}
                as="li"
                delay={index * 70}
                className={`flex flex-col gap-3 rounded-lg border bg-surface p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-22px_rgba(0,0,0,0.45)] ${
                  plan.highlight ? "border-brand" : "border-border"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[17px] font-semibold tracking-tight text-ink">{plan.name}</h3>
                  {plan.highlight && (
                    <span className="rounded-sm bg-brand-tint px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-brand">
                      yaygın
                    </span>
                  )}
                </div>
                <p className="flex items-baseline gap-1.5">
                  {plan.monthly === null ? (
                    <span className="text-[24px] font-semibold tracking-tight text-ink">
                      Görüşelim
                    </span>
                  ) : (
                    <>
                      {/* data-numeric YOK: tabular-nums basamakları eşitlerken
                          binlik noktasını da geniş bir hücreye oturtuyor ve
                          "1 . 890" gibi görünüyor. Hizalanacak sütun değil. */}
                      <span className="text-[28px] font-semibold tracking-tight text-ink">
                        {formatMonthly(plan.monthly)}
                      </span>
                      <span className="text-[13px] text-ink-3">/ ay</span>
                    </>
                  )}
                </p>
                <p className="text-[14px] leading-relaxed text-ink-2">{plan.fit}</p>
              </Reveal>
            ))}
          </ul>

          {PRICING_IS_DRAFT && (
            <p className="pt-5 text-[13px] text-ink-3">
              Rakamlar temsilidir: paket içerikleri ilk kurumlarla birlikte netleşiyor.
            </p>
          )}
        </Container>
      </section>

      {/* --------------------------------------------------------------- kvkk */}
      <section id="kvkk" className="scroll-mt-24 border-b border-border">
        <Container className="py-16">
          <Reveal className="flex max-w-xl flex-col gap-4 pb-10">
            <Eyebrow index="06">KVKK</Eyebrow>
            <h2 className={H2}>KVKK, sonradan eklenen bir bölüm değil</h2>
            <p className={LEAD}>
              Randevu tutan her işletme kişisel veri işler; sağlık bilgisi tutan biri özel
              nitelikli veri işler ve o kuralları sonradan uygulayamaz. Sistemin tuttuğu kayıtlar:
            </p>
          </Reveal>

          <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {COMPLIANCE.map((item, index) => (
              <Reveal
                key={item.title}
                as="li"
                delay={index * 60}
                className="flex max-w-md flex-col gap-2 border-t border-border pt-4"
              >
                <h3 className="text-[16px] font-semibold text-ink">{item.title}</h3>
                <p className={BODY}>{item.body}</p>
              </Reveal>
            ))}
          </ul>

          <p className="max-w-2xl pt-10 text-[14px] leading-relaxed text-ink-3">
            Bunlar sistemin tuttuğu kayıtlardır, bir uygunluk belgesi değildir. Veri sorumlusu
            işletmenin kendisidir; TeyitRandevu veri işleyen sıfatıyla altyapıyı sağlar ve gerekli
            kayıtları tutar.
          </p>
        </Container>
      </section>

      {/* ---------------------------------------------------------------- sss */}
      <section className="border-b border-border">
        <Container className="grid gap-10 py-16 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-4">
            <Eyebrow index="07">Sık sorulanlar</Eyebrow>
            <h2 className={H2}>Önce sorulan beş şey</h2>
          </div>

          <dl className="flex max-w-2xl flex-col divide-y divide-border border-y border-border">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-2 py-5">
                <dt className="text-[16px] font-semibold text-ink">{item.q}</dt>
                <dd className={BODY}>{item.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ------------------------------------------------------ nasıl başlanır */}
      <section className="border-b border-border bg-surface-2">
        <Container className="py-16">
          <div className="flex max-w-2xl flex-col gap-4 pb-10">
            <Eyebrow index="08">Başlangıç</Eyebrow>
            <h2 className={H2}>Üç adım, biri şu anda</h2>
          </div>

          <ol className="grid gap-8 lg:grid-cols-3">
            {START_STEPS.map((step, index) => (
              <Reveal
                key={step.title}
                as="li"
                delay={index * 80}
                className="flex min-w-0 flex-col gap-2 border-t-2 border-brand pt-4"
              >
                <span data-numeric className="font-mono text-[13px] text-brand">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className={H3}>{step.title}</h3>
                <p className={BODY}>{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      {/* ----------------------------------------------------------------- cta */}
      <section className="relative isolate overflow-hidden border-b border-border">
        {/* Fotoğraf dekor değil bağlam: sayfanın anlattığı yer burası. Metnin
            okunması için üstünde tam kapaklı bir perde var; koyu temada da
            aynı perde çalışıyor. */}
        <Image
          src="/sektor/resepsiyon.jpg"
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
        />
        {/* Perde soldan sağa açılıyor: metin tarafı tam zemin, sağ taraf
            fotoğrafı gösteriyor. Renk `--bg` olduğu için koyu temada da
            kontrast korunuyor. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(90deg, var(--bg) 0%, var(--bg) 40%, color-mix(in oklab, var(--bg) 62%, transparent) 100%)",
          }}
        />

        <Container className="flex flex-col gap-5 py-20">
          <h2 className={`${H2} max-w-2xl`}>Pilot işletmelerle birlikte kuruyoruz</h2>
          <p className={`${LEAD} max-w-2xl`}>
            İlk kurumlarla çalışıp eksikleri onların günlük işine göre kapatıyoruz. İşinizi
            anlatın, size sistemi gösterelim ve neyin işinize yaramadığını söyleyin.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/demo" className={BTN_PRIMARY}>
              Demoyu deneyin
            </Link>
            <Link href="/iletisim" className={BTN_SECONDARY}>
              Pilot için görüşelim
            </Link>
          </div>
          <p className="text-[13px] text-ink-3">
            Kayıt istemez · Kart istemez · Kurulum ve eğitim pilotta ücretsiz
          </p>
        </Container>
      </section>

    </div>
  );
}

/* Günün programı çıktısı — sayfaya özel, bu yüzden mock dosyasında değil. */
function ProgramMock() {
  const rows = [
    { time: "09:00", who: "A. Yılmaz", service: "İmplant", state: "Onaylandı" },
    { time: "09:30", who: "M. Kaya", service: "Kontrol", state: "Geldi" },
    { time: "10:30", who: "Z. Ateş", service: "Kanal tedavisi", state: "Onay bekliyor" },
    { time: "11:00", who: "S. Demir", service: "Dolgu", state: "Onaylandı" },
  ];

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-28px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <p className="text-[13px] font-medium text-ink">Günün programı · 1 Eylül</p>
        <p className="font-mono text-[11px] text-ink-3">Dr. Ayla Demir</p>
      </div>
      <table className="w-full text-[13px]">
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.time}>
              <td className="px-3.5 py-2.5 font-mono text-ink-2">{row.time}</td>
              <td className="px-1 py-2.5 text-ink">{row.who}</td>
              <td className="px-1 py-2.5 text-ink-2">{row.service}</td>
              <td className="px-3.5 py-2.5 text-right text-ink-3">{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-3.5 py-2.5 text-[12px] text-ink-3">
        <span className="font-mono">A4 çıktı</span>
        <span>·</span>
        <span className="font-mono">Excel</span>
        <span>·</span>
        <span>ekranla aynı veri</span>
      </div>
    </div>
  );
}
