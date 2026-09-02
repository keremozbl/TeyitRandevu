import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Container, Eyebrow, H1, H3, LEAD } from "@/components/marketing/ui";
import { startDemoAction } from "@/lib/demo/actions";
import { demoAccount, DEMO_TENANT_NAME, DEMO_TENANT_SLUG } from "@/lib/demo/config";

export const metadata: Metadata = {
  title: "Canlı demo",
  description:
    "TeyitRandevu panelini kayıt olmadan deneyin: örnek bir diş kliniğinin dolu bir günü, gerçek arayüz.",
};

/** Ziyaretçi ilk beş dakikada neyi denerse ürünü anlar. */
const TRY: {
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
}[] = [
  {
    title: "Takvimde bir randevu taşıyın",
    body: "Bloğu sürükleyip başka bir saate bırakın, kenarından tutup süresini uzatın. Dolu bir saate bıraktığınızda kayıt kabul edilmez — kural veritabanında.",
  },
  {
    title: "Hasta kartını açın",
    body: "Geçmiş randevular, esnek alanlar ve rıza kayıtları orada. Kartı açtığınız denetim kaydına yazılır; Ayarlar → Denetim’de kendi izinizi görürsünüz.",
  },
  {
    title: "Günün programını yazdırın",
    body: "Raporlar → Günün programı; aynı veriden A4 çıktı ve Excel. Yazdırma önizlemesi kâğıda göre ayrı biçimlenir.",
  },
  {
    title: "Hastanın gördüğü sayfayı açın",
    body: "Vitrin kliniğinin randevu sayfası herkese açık: boş saatleri seçin, KVKK kutularını görün. Panelde randevunun onay bekleyen olarak düştüğünü fark edin.",
    href: `/r/${DEMO_TENANT_SLUG}`,
    hrefLabel: "Randevu sayfasını aç",
  },
  {
    title: "Bildirim kuyruğuna bakın",
    body: "Şablonu düzenleyin, mesajın kaç SMS parçası ettiğini görün. Sağlayıcı bağlı olmadığı için hiçbir mesaj gerçekten gitmez ve panel bunu satır satır söyler.",
  },
];

export default async function DemoSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const acik = demoAccount() !== null;

  return (
    <Container className="py-14">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
        <div className="flex max-w-xl flex-col gap-6">
          <Eyebrow>Canlı demo</Eyebrow>
          <h1 className={H1}>Abone olmuş gibi girin</h1>
          <p className={LEAD}>
            Kayıt yok, e-posta doğrulaması yok, kart yok. Düğmeye bastığınızda örnek bir diş
            kliniğinin — {DEMO_TENANT_NAME} — dolu bir gününe, panelin kendisine düşersiniz.
            Sunum değil, ürünün aynısı.
          </p>

          {durum === "hata" && (
            <Alert tone="error">
              Demo oturumu açılamadı. Birkaç dakika sonra tekrar deneyin ya da{" "}
              <Link href="/iletisim" className="underline underline-offset-2">
                bize yazın
              </Link>
              .
            </Alert>
          )}

          {acik ? (
            <form action={startDemoAction} className="flex flex-col gap-3">
              <button
                type="submit"
                className="inline-flex h-12 w-fit items-center justify-center rounded border border-brand bg-brand px-6 text-[16px] font-medium text-brand-ink transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong"
              >
                Demoyu başlat
              </button>
              <p className="text-[13px] text-ink-3">
                Panelden çıkmak için sağ üstteki “Çıkış”. Kendi kurumunuzu kurmak isterseniz{" "}
                <Link href="/iletisim" className="text-ink underline underline-offset-2">
                  demo talebi bırakın
                </Link>
                .
              </p>
            </form>
          ) : (
            <Alert tone="info">
              <strong className="font-medium">Canlı demo şu an kapalı.</strong> Bunun yerine
              kliniğinizi anlatın, sistemi birlikte gezelim:{" "}
              <Link href="/iletisim" className="underline underline-offset-2">
                demo talebi
              </Link>
              .
            </Alert>
          )}

          <section className="flex flex-col gap-5 border-t border-border pt-8">
            <h2 className={H3}>İlk beş dakikada bunları deneyin</h2>
            <ol className="flex flex-col gap-5">
              {TRY.map((item, index) => (
                <li key={item.title} className="flex gap-4">
                  <span data-numeric className="font-mono text-[13px] text-brand">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <h3 className="text-[16px] font-semibold text-ink">{item.title}</h3>
                    <p className="text-[15px] leading-[1.7] text-ink-2">{item.body}</p>
                    {item.href && (
                      <Link
                        href={item.href}
                        className="text-[14px] text-ink underline underline-offset-2"
                      >
                        {item.hrefLabel}
                      </Link>
                    )}
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
            {[
              "Bu kurum herkese açık ve ortaktır: aynı anda giren başka ziyaretçiler de aynı takvimi görür ve değiştirebilir.",
              "Gerçek hasta bilgisi girmeyin. Kayıtlar düzenli olarak silinip örnek veriyle yeniden kurulur.",
              "Hiçbir mesaj gerçekten gönderilmez: SMS sağlayıcısı bağlı değil, kuyruk yalnızca kaydı yazar.",
              "Kendi kurumunuz kurulduğunda verinizi hiçbir demo kullanıcısı göremez — kurum sınırı veritabanında.",
              "Vitrin kurumu diş kliniği şablonuyla kuruldu: sizde “hasta” yerine “danışan” ya da “müşteri”, “hekim” yerine “usta” yazacak. Terimler sektör şablonundan geliyor.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-brand" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Container>
  );
}
