import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PLANS, PRICING_IS_DRAFT } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Fiyat",
  description:
    "TeyitRandevu paketleri: tek hekimden zincir kliniğe. Pilot dönemde fiyatlar kurumla birlikte belirleniyor.",
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

export default function FiyatSayfasi() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex max-w-xl flex-col gap-3 pb-8">
        <h1 className="text-pretty text-3xl leading-tight tracking-tight">Paketler</h1>
        <p className="text-[15px] leading-relaxed text-ink-2">
          Üç paket: tek hekimin muayenehanesi, birden çok hekimin çalıştığı klinik ve şubeli
          kurumlar. Hepsinde takvim, hasta kartı ve günün programı var; fark yetki derinliği,
          kullanıcı sayısı ve hatırlatma hacminde.
        </p>
      </div>

      {PRICING_IS_DRAFT && (
        <div className="max-w-2xl pb-8">
          <Alert tone="info">
            <strong className="font-medium">Fiyatlar temsilidir.</strong> Pilot dönemdeyiz; paket
            içerikleri ve rakamlar ilk kurumlarla birlikte netleşiyor. Görüşmede kliniğinizin
            büyüklüğüne göre konuşuyoruz.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <section
            key={plan.key}
            className={`flex flex-col rounded border bg-surface ${
              plan.highlight ? "border-accent" : "border-border"
            }`}
          >
            <div className="flex flex-col gap-2 border-b border-border p-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[17px] font-semibold tracking-tight text-ink">{plan.name}</h2>
                {plan.highlight && (
                  <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent">
                    yaygın
                  </span>
                )}
              </div>
              <p className="min-h-[2.5rem] text-[13px] leading-relaxed text-ink-2">{plan.fit}</p>
              <p className="flex items-baseline gap-1.5 pt-1">
                {plan.monthly === null ? (
                  <span className="text-[22px] tracking-tight text-ink">Görüşelim</span>
                ) : (
                  <>
                    <span data-numeric className="text-[26px] tracking-tight text-ink">
                      {money.format(plan.monthly)}
                    </span>
                    <span className="text-[13px] text-ink-3">/ ay</span>
                  </>
                )}
              </p>
              <Link
                href="/iletisim"
                className={`mt-2 inline-flex h-9 items-center justify-center rounded px-3 text-[13px] font-medium no-underline transition-colors duration-150 ${
                  plan.highlight
                    ? "border border-accent bg-accent text-accent-ink hover:bg-accent-hover"
                    : "border border-border bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                {plan.monthly === null ? "Teklif isteyin" : "Demo isteyin"}
              </Link>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-4">
              <ul className="flex flex-col gap-2">
                {plan.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] text-ink">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>

              <dl className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
                {plan.limits.map((limit) => (
                  <div key={limit.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[12px] text-ink-3">{limit.label}</dt>
                    <dd data-numeric className="text-[12px] text-ink-2">
                      {limit.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ))}
      </div>

      <section className="flex max-w-2xl flex-col gap-3 pt-12">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">
          Fiyata dahil olmayan tek şey
        </h2>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Gönderilen SMS ve WhatsApp mesajlarının operatör ücreti. Türkçe karakter içeren bir
          mesaj 70 karakterde bir parçaya bölünür, yani metnin uzunluğu doğrudan faturaya
          yansır; şablon ekranı yazarken parça sayısını gösteriyor. Dilerseniz kendi operatör
          sözleşmenizi bağlayabilirsiniz.
        </p>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Kurulum, veri aktarımı ve eğitim pilot döneminde ücretsiz.
        </p>
      </section>
    </div>
  );
}
