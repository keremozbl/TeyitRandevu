import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Container, Eyebrow, H1, H3, LEAD } from "@/components/marketing/ui";
import { startDemoAction } from "@/lib/demo/actions";
import { isDemoEnabled } from "@/lib/demo/config";
import { FAMILY_LABELS, listTemplates } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Canlı demo",
  description:
    "Kendi işletmenizle deneyin: sektörünüzü seçin, kurulumu doldurun, dolu bir takvime düşün. Kayıt yok.",
};

const STEPS = [
  {
    title: "Sektörünüzü seçin",
    body: "Hizmetler, süreler, roller ve mesaj şablonları o sektörün şablonundan gelir.",
  },
  {
    title: "Kurulumu doldurun",
    body: "İşletmenizin adı, çalışma günleri ve saatleri. Gerçek kurulumun aynısı — kısaltılmış bir sunum değil.",
  },
  {
    title: "Takvime düşün",
    body: "Panel sizin dilinizle açılır (“Danışanlar”, “Ustalar”) ve takvimde örnek bir gün hazır bekler: farklı durumlarda randevular, bir izin bloğu.",
  },
];

const NOTES = [
  "Kurum yalnızca size ait: başka bir ziyaretçi onu göremez, değiştiremez. Sınırı veritabanı çiziyor.",
  "Gerçek kişi bilgisi girmeyin. Demo kurumu ve hesabı bir gün sonra siliniyor.",
  "Hiçbir mesaj gerçekten gönderilmez: SMS sağlayıcısı bağlı değil, kuyruk yalnızca kaydı yazar.",
  "İstediğiniz her şeyi değiştirin — hizmet ekleyin, randevu taşıyın, rol yetkisi kısın.",
];

const DURUM: Record<string, string> = {
  hata: "Demo başlatılamadı. Birkaç dakika sonra tekrar deneyin.",
  sektor: "Önce bir sektör seçin.",
  yogun: "Bu adresten kısa sürede çok fazla demo açıldı. Biraz sonra tekrar deneyin.",
  kapali: "Canlı demo şu an kapalı.",
};

export default async function DemoSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ sektor?: string; durum?: string }>;
}) {
  const { sektor, durum } = await searchParams;
  const templates = listTemplates();
  const acik = isDemoEnabled();
  const selected = templates.some((template) => template.key === sektor)
    ? sektor
    : templates[0]?.key;

  return (
    <Container className="py-14">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
        <div className="flex max-w-2xl flex-col gap-6">
          <Eyebrow>Canlı demo</Eyebrow>
          <h1 className={H1}>Kendi kurumunuzu kurun</h1>
          <p className={LEAD}>
            Hazır bir hesaba girmiyorsunuz: sektörünüzü seçiyor, kurulumu kendiniz dolduruyor ve
            kendi kurumunuzun takvimine düşüyorsunuz. Kayıt yok, e-posta doğrulaması yok, kart yok.
          </p>

          {durum && DURUM[durum] && (
            <Alert tone={durum === "kapali" ? "info" : "error"}>
              {DURUM[durum]}{" "}
              <Link href="/iletisim" className="underline underline-offset-2">
                Bize yazın
              </Link>
              , işletmenizi birlikte kuralım.
            </Alert>
          )}

          {acik ? (
            <form action={startDemoAction} className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2.5">
                <legend className={`${H3} pb-2`}>Hangi işi yapıyorsunuz?</legend>

                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((template) => (
                    <label
                      key={template.key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors duration-150 hover:border-border-strong has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
                    >
                      <input
                        type="radio"
                        name="sektor"
                        value={template.key}
                        defaultChecked={template.key === selected}
                        className="mt-1 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-medium text-ink">{template.label}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                          {FAMILY_LABELS[template.family]}
                        </span>
                        <span className="text-[13px] leading-relaxed text-ink-2">
                          {template.terminology.customer_plural} ·{" "}
                          {template.terminology.resource_plural} ·{" "}
                          <span data-numeric>{template.services.length}</span> hazır hizmet
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded border border-brand bg-brand px-6 text-[16px] font-medium text-brand-ink transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong"
                >
                  Demoyu başlat
                </button>
                <p className="text-[13px] text-ink-3">Kurulum üç adım, yaklaşık bir dakika.</p>
              </div>
            </form>
          ) : (
            <Alert tone="info">
              <strong className="font-medium">Canlı demo şu an kapalı.</strong> Bunun yerine
              işletmenizi anlatın, sistemi birlikte gezelim:{" "}
              <Link href="/iletisim" className="underline underline-offset-2">
                demo talebi
              </Link>
              .
            </Alert>
          )}

          <section className="flex flex-col gap-5 border-t border-border pt-8">
            <h2 className={H3}>Düğmeye bastığınızda ne oluyor</h2>
            <ol className="flex flex-col gap-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span data-numeric className="font-mono text-[13px] text-brand">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-[16px] font-semibold text-ink">{step.title}</h3>
                    <p className="text-[15px] leading-[1.7] text-ink-2">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2 p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-2">
            Demoda bilmeniz gerekenler
          </h2>
          <ul className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
            {NOTES.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-brand" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border pt-4 text-[13px] leading-relaxed text-ink-3">
            Kurumunuzu gerçekten kurmaya karar verirseniz veriyi sıfırdan girmenize gerek yok:
            kurulumda mevcut listenizi birlikte aktarıyoruz.
          </p>
        </aside>
      </div>
    </Container>
  );
}
