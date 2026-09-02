import type { Metadata } from "next";
import Link from "next/link";

import {
  BODY,
  BTN_SMALL,
  Container,
  Eyebrow,
  H1,
  H3,
  LEAD,
} from "@/components/marketing/ui";
import { Alert } from "@/components/ui/alert";
import { formatMonthly, PLANS, PRICING_IS_DRAFT } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Fiyat",
  description:
    "TeyitRandevu paketleri: tek uzmandan zincir işletmeye. Pilot dönemde fiyatlar kurumla birlikte belirleniyor.",
};

export default function FiyatSayfasi() {
  return (
    <Container className="py-14">
      <div className="flex max-w-2xl flex-col gap-4 pb-10">
        <Eyebrow>Paketler</Eyebrow>
        <h1 className={H1}>Üç paket, tek fark: derinlik</h1>
        <p className={LEAD}>
          Tek kişinin çalıştığı muayenehane ya da salon, birden çok uzmanın çalıştığı işletme ve
          şubeli kurumlar. Hepsinde takvim, müşteri kartı ve günün programı var; fark yetki
          derinliği, kullanıcı sayısı ve hatırlatma hacminde.
        </p>
      </div>

      {PRICING_IS_DRAFT && (
        <div className="max-w-2xl pb-10">
          <Alert tone="info">
            <strong className="font-medium">Fiyatlar temsilidir.</strong> Pilot dönemdeyiz; paket
            içerikleri ve rakamlar ilk kurumlarla birlikte netleşiyor. Görüşmede kliniğinizin
            büyüklüğüne göre konuşuyoruz.
          </Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <section
            key={plan.key}
            className={`flex flex-col rounded-lg border bg-surface ${
              plan.highlight ? "border-brand shadow-[0_18px_40px_-28px_rgba(0,0,0,0.3)]" : "border-border"
            }`}
          >
            <div className="flex flex-col gap-2.5 border-b border-border p-5">
              <div className="flex items-baseline gap-2">
                <h2 className={H3}>{plan.name}</h2>
                {plan.highlight && (
                  <span className="rounded-sm bg-brand-tint px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-brand">
                    yaygın
                  </span>
                )}
              </div>
              <p className="min-h-[2.75rem] text-[14px] leading-relaxed text-ink-2">{plan.fit}</p>
              <p className="flex items-baseline gap-1.5 pt-1">
                {plan.monthly === null ? (
                  <span className="text-[26px] font-semibold tracking-tight text-ink">
                    Görüşelim
                  </span>
                ) : (
                  <>
                    {/* data-numeric YOK: bkz. ana sayfa — tabular-nums binlik
                        noktasını geniş hücreye oturtup "1 . 890" gösteriyor. */}
                    <span className="text-[32px] font-semibold tracking-tight text-ink">
                      {formatMonthly(plan.monthly)}
                    </span>
                    <span className="text-[13px] text-ink-3">/ ay</span>
                  </>
                )}
              </p>
              <Link
                href="/iletisim"
                className={`${BTN_SMALL} mt-2 ${
                  plan.highlight
                    ? "border border-brand bg-brand text-brand-ink hover:border-brand-strong hover:bg-brand-strong"
                    : "border border-border-strong bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                {plan.monthly === null ? "Teklif isteyin" : "Demo isteyin"}
              </Link>
            </div>

            <div className="flex flex-1 flex-col gap-5 p-5">
              <ul className="flex flex-col gap-2.5">
                {plan.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-ink">
                    <span aria-hidden="true" className="mt-[10px] h-px w-3 shrink-0 bg-brand" />
                    {item}
                  </li>
                ))}
              </ul>

              <dl className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
                {plan.limits.map((limit) => (
                  <div key={limit.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] text-ink-3">{limit.label}</dt>
                    <dd data-numeric className="text-[13px] font-medium text-ink-2">
                      {limit.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ))}
      </div>

      <section className="flex max-w-2xl flex-col gap-3 pt-14">
        <h2 className={H3}>Fiyata dahil olmayan tek şey</h2>
        <p className={BODY}>
          Gönderilen SMS ve WhatsApp mesajlarının operatör ücreti. Türkçe karakter içeren bir mesaj
          70 karakterde bir parçaya bölünür, yani metnin uzunluğu doğrudan faturaya yansır; şablon
          ekranı yazarken parça sayısını gösteriyor. Dilerseniz kendi operatör sözleşmenizi
          bağlayabilirsiniz.
        </p>
        <p className={BODY}>Kurulum, veri aktarımı ve eğitim pilot döneminde ücretsiz.</p>
      </section>
    </Container>
  );
}
