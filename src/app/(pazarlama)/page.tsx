import type { Metadata } from "next";
import Link from "next/link";

import { MOCKS } from "@/components/marketing/product-mocks";
import { CAPABILITIES, COMPLIANCE, FAQ, PRODUCT } from "@/lib/marketing/content";

export const metadata: Metadata = {
  // `absolute`: ana sayfa kök layout'taki "%s · TeyitRandevu" şablonunu
  // kullanmaz, yoksa başlık "TeyitRandevu … · TeyitRandevu" olurdu.
  title: { absolute: "TeyitRandevu · Diş klinikleri için randevu ve hasta takibi" },
  description: PRODUCT.summary,
};

export default function AnaSayfa() {
  return (
    <div className="flex flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-12 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center">
          <div className="flex max-w-xl flex-col gap-5">
            <h1 className="text-pretty text-3xl leading-[1.15] tracking-tight sm:text-4xl">
              Randevular çakışmasın,
              <br />
              hasta gelmeyi unutmasın.
            </h1>

            <p className="text-pretty text-[15px] leading-relaxed text-ink-2">
              Diş klinikleri için randevu, hasta takibi ve hatırlatma sistemi. Günün programı her
              sabah hazır çıkar; aynı saate iki hasta yazılması veritabanı düzeyinde engellenir.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/iletisim"
                className="inline-flex h-10 items-center rounded border border-accent bg-accent px-4 text-[14px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
              >
                Pilot için görüşelim
              </Link>
              <Link
                href="#urun"
                className="inline-flex h-10 items-center rounded border border-border bg-surface px-4 text-[14px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
              >
                Nasıl çalıştığını görün
              </Link>
            </div>

            <p className="flex items-start gap-2 text-[13px] text-ink-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-st-pending" />
              {PRODUCT.stage}
            </p>
          </div>

          {/* Eğik perspektif yok: ürün ekranı okunacak, dekor değil. */}
          <div className="lg:justify-self-end">
            <MOCKS.grid />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ günün programı */}
      <section className="border-y border-border bg-surface-2">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 lg:grid-cols-2 lg:items-start">
          <div className="flex max-w-xl flex-col gap-4">
            <p className="font-mono text-[12px] uppercase tracking-wide text-ink-3">
              Sabah 08:40
            </p>
            <h2 className="text-pretty text-2xl leading-tight tracking-tight">
              Günün programını elle hazırlamak
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Çoğu klinikte gün, defterden Excel’e satır taşıyarak başlıyor: hekim hekim
              kimin geleceği, hangi tedavi, kim gelmedi. Yirmi dakika sürüyor, bir randevu
              atlandığında kimse fark etmiyor ve öğlen değişen bir saat listeye hiç yansımıyor.
            </p>
            <p className="text-[15px] leading-relaxed text-ink-2">
              TeyitRandevu’da o liste bir çıktı: ekranda görünür, A4 olarak yazdırılır, Excel
              olarak indirilir. Üçü de aynı veriden üretilir, yani biri güncelken diğeri eski
              olamaz.
            </p>
            <ul className="flex flex-col gap-2 pt-1">
              {[
                "Hekim hekim ayrılmış, saat sırasına dizilmiş",
                "İptal ve gelmeyen ayrı sayılır, listeyi kirletmez",
                "Ücret sütunu yalnızca yetkisi olana görünür",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14px] text-ink">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:pt-6">
            <ProgramMock />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- ürün */}
      <section id="urun" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-14">
        <div className="flex max-w-xl flex-col gap-3 pb-10">
          <h2 className="text-pretty text-2xl leading-tight tracking-tight">
            Dört şey, dördü de gerçekten çalışıyor
          </h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Aşağıdaki ekranlar ürünün kendisinden: çizim değil, aynı arayüzün parçaları.
          </p>
        </div>

        <div className="flex flex-col gap-12">
          {CAPABILITIES.map((capability, index) => {
            const Mock = MOCKS[capability.mock];
            return (
              <article
                key={capability.key}
                className="grid gap-6 lg:grid-cols-2 lg:items-center lg:gap-10"
              >
                <div
                  className={`flex max-w-xl flex-col gap-3 ${index % 2 === 1 ? "lg:order-2" : ""}`}
                >
                  <h3 className="text-[17px] font-semibold tracking-tight text-ink">
                    {capability.title}
                  </h3>
                  <p className="text-[14px] font-medium text-accent">{capability.claim}</p>
                  <p className="text-[14px] leading-relaxed text-ink-2">{capability.body}</p>
                </div>
                <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                  <Mock />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------- kvkk */}
      <section id="kvkk" className="border-y border-border bg-surface-2">
        <div className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-14">
          <div className="flex max-w-xl flex-col gap-3 pb-8">
            <h2 className="text-pretty text-2xl leading-tight tracking-tight">
              KVKK, sonradan eklenen bir bölüm değil
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Sağlık verisi özel nitelikli kişisel veridir ve kuralları sonradan uygulanamaz.
              Sistemin tuttuğu kayıtlar:
            </p>
          </div>

          <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {COMPLIANCE.map((item) => (
              <li key={item.title} className="flex max-w-md flex-col gap-1.5">
                <h3 className="text-[14px] font-semibold text-ink">{item.title}</h3>
                <p className="text-[14px] leading-relaxed text-ink-2">{item.body}</p>
              </li>
            ))}
          </ul>

          <p className="max-w-2xl pt-8 text-[13px] leading-relaxed text-ink-3">
            Bunlar sistemin tuttuğu kayıtlardır, bir uygunluk belgesi değildir. Veri sorumlusu
            kurumun kendisidir; TeyitRandevu veri işleyen sıfatıyla altyapıyı sağlar ve gerekli
            kayıtları tutar.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- sss */}
      <section className="mx-auto w-full max-w-5xl px-4 py-14">
        <h2 className="pb-6 text-pretty text-2xl leading-tight tracking-tight">Sık sorulanlar</h2>
        <dl className="flex max-w-2xl flex-col divide-y divide-border border-y border-border">
          {FAQ.map((item) => (
            <div key={item.q} className="flex flex-col gap-1.5 py-4">
              <dt className="text-[14px] font-semibold text-ink">{item.q}</dt>
              <dd className="text-[14px] leading-relaxed text-ink-2">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ----------------------------------------------------------------- cta */}
      <section className="border-t border-border bg-surface-2">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-14">
          <h2 className="max-w-xl text-pretty text-2xl leading-tight tracking-tight">
            Pilot kliniklerle birlikte kuruyoruz
          </h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-2">
            İlk kurumlarla çalışıp eksikleri onların günlük işine göre kapatıyoruz. Kliniğinizi
            anlatın, size sistemi gösterelim ve neyin işinize yaramadığını söyleyin.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link
              href="/iletisim"
              className="inline-flex h-10 items-center rounded border border-accent bg-accent px-4 text-[14px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
            >
              Demo isteyin
            </Link>
            <Link
              href="/fiyat"
              className="inline-flex h-10 items-center rounded border border-border bg-surface px-4 text-[14px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
            >
              Paketlere bakın
            </Link>
          </div>
        </div>
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
      className="overflow-hidden rounded border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-[13px] font-medium text-ink">Günün programı · 1 Eylül</p>
        <p className="font-mono text-[11px] text-ink-3">Dr. Ayla Demir</p>
      </div>
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.time}>
              <td className="px-3 py-2 font-mono text-ink-2">{row.time}</td>
              <td className="px-1 py-2 text-ink">{row.who}</td>
              <td className="px-1 py-2 text-ink-2">{row.service}</td>
              <td className="px-3 py-2 text-right text-ink-3">{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
        <span className="font-mono">A4 çıktı</span>
        <span>·</span>
        <span className="font-mono">Excel</span>
        <span>·</span>
        <span>ekranla aynı veri</span>
      </div>
    </div>
  );
}
